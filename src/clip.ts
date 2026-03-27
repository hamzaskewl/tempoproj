// Auto-clip via Twitch Helix API with persistent token refresh

import { db } from './db/index.js'
import { twitchTokens } from './db/schema.js'
import { eq } from 'drizzle-orm'

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || ''
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || ''

let userToken: string | null = null
let refreshToken: string | null = null
let userId: string | null = null

export function setTwitchAuth(token: string, id: string, refresh?: string) {
  userToken = token
  userId = id
  if (refresh) refreshToken = refresh
  // Persist to DB
  if (db && refresh) {
    db.insert(twitchTokens).values({
      userId: id, accessToken: token, refreshToken: refresh,
    }).onConflictDoUpdate({
      target: twitchTokens.userId,
      set: { accessToken: token, refreshToken: refresh, updatedAt: new Date() },
    }).catch(err => console.error('[clip] Failed to persist token:', err.message))
  }
}

export function hasTwitchAuth() {
  return !!userToken
}

export function getTwitchAuth() {
  return { clientId: TWITCH_CLIENT_ID, clientSecret: TWITCH_CLIENT_SECRET, userToken, userId }
}

// Restore token from DB on startup and refresh it
export async function restoreTwitchAuth(): Promise<boolean> {
  if (!db) return false
  try {
    const rows = await db.select().from(twitchTokens).limit(1)
    if (rows.length === 0) {
      console.log('[clip] No saved Twitch token found')
      return false
    }
    const saved = rows[0]
    userId = saved.userId
    refreshToken = saved.refreshToken

    // Try to refresh the token
    const refreshed = await doTokenRefresh()
    if (refreshed) {
      console.log(`[clip] Restored Twitch auth for user ${userId} from DB`)
      return true
    }

    // If refresh failed, the saved tokens are dead
    console.warn('[clip] Saved token refresh failed — user needs to re-login')
    return false
  } catch (err: any) {
    console.error('[clip] Failed to restore token:', err.message)
    return false
  }
}

async function doTokenRefresh(): Promise<boolean> {
  if (!refreshToken || !TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return false
  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })
    const data = await res.json() as any
    if (data.access_token) {
      userToken = data.access_token
      if (data.refresh_token) refreshToken = data.refresh_token
      // Update DB
      if (db && userId) {
        await db.update(twitchTokens).set({
          accessToken: userToken!,
          refreshToken: refreshToken!,
          updatedAt: new Date(),
        }).where(eq(twitchTokens.userId, userId))
      }
      return true
    }
    console.error('[clip] Token refresh response:', data)
    return false
  } catch (err: any) {
    console.error('[clip] Token refresh failed:', err.message)
    return false
  }
}

// Broadcaster ID cache
const broadcasterCache = new Map<string, { id: string; cachedAt: number }>()

async function getBroadcasterId(channel: string): Promise<string | null> {
  const cached = broadcasterCache.get(channel)
  if (cached && Date.now() - cached.cachedAt < 600_000) return cached.id

  if (!userToken) return null
  const res = await fetch(`https://api.twitch.tv/helix/users?login=${channel}`, {
    headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${userToken}` },
  })

  // If 401, try refresh
  if (res.status === 401) {
    const refreshed = await doTokenRefresh()
    if (!refreshed) return null
    const retry = await fetch(`https://api.twitch.tv/helix/users?login=${channel}`, {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${userToken}` },
    })
    const data = await retry.json() as any
    const id = data.data?.[0]?.id
    if (id) broadcasterCache.set(channel, { id, cachedAt: Date.now() })
    return id || null
  }

  const data = await res.json() as any
  const id = data.data?.[0]?.id
  if (id) broadcasterCache.set(channel, { id, cachedAt: Date.now() })
  return id || null
}

export async function createClip(channel: string): Promise<{ clipId: string; clipUrl: string; editUrl: string } | null> {
  if (!userToken) return null

  try {
    const broadcasterId = await getBroadcasterId(channel)
    if (!broadcasterId) return null

    let clipRes = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&has_delay=false`, {
      method: 'POST',
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${userToken}` },
    })

    // If 401, try refresh and retry
    if (clipRes.status === 401) {
      const refreshed = await doTokenRefresh()
      if (!refreshed) return null
      clipRes = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&has_delay=false`, {
        method: 'POST',
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${userToken}` },
      })
    }

    const clipData = await clipRes.json() as any

    if (clipData.data?.[0]) {
      const clip = clipData.data[0]
      return {
        clipId: clip.id,
        clipUrl: `https://clips.twitch.tv/${clip.id}`,
        editUrl: clip.edit_url,
      }
    }

    return null
  } catch (err: any) {
    console.error(`[clip] Error clipping ${channel}:`, err.message)
    return null
  }
}

// Periodically refresh token to keep it alive (every 3 hours)
setInterval(async () => {
  if (refreshToken && userId) {
    const ok = await doTokenRefresh()
    if (ok) console.log('[clip] Token auto-refreshed')
    else console.warn('[clip] Token auto-refresh failed')
  }
}, 3 * 60 * 60 * 1000)
