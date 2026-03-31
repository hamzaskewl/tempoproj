// Auto-clip via Twitch Helix API with persistent token refresh

import { db } from './db/index.js'
import { twitchTokens } from './db/schema.js'
import { eq } from 'drizzle-orm'

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || ''
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || ''

// Per-user token cache: userId -> { accessToken, refreshToken }
const tokenCache = new Map<string, { accessToken: string; refreshToken: string | null }>()

// Legacy global token (used as fallback / for hasTwitchAuth check)
let legacyUserToken: string | null = null
let legacyUserId: string | null = null

export function setTwitchAuth(token: string, id: string, refresh?: string) {
  legacyUserToken = token
  legacyUserId = id
  tokenCache.set(id, { accessToken: token, refreshToken: refresh || null })
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
  return tokenCache.size > 0 || !!legacyUserToken
}

export function getTwitchAuth() {
  return { clientId: TWITCH_CLIENT_ID, clientSecret: TWITCH_CLIENT_SECRET, userToken: legacyUserToken, userId: legacyUserId }
}

// Get token for a specific user (from cache or DB)
async function getTokenForUser(userId: string): Promise<{ accessToken: string; refreshToken: string | null } | null> {
  const cached = tokenCache.get(userId)
  if (cached) return cached
  if (!db) return null
  const rows = await db.select().from(twitchTokens).where(eq(twitchTokens.userId, userId))
  if (rows.length === 0) return null
  const tok = { accessToken: rows[0].accessToken, refreshToken: rows[0].refreshToken }
  tokenCache.set(userId, tok)
  return tok
}

// Refresh token for a specific user
async function refreshUserToken(userId: string): Promise<boolean> {
  const tok = tokenCache.get(userId)
  if (!tok?.refreshToken || !TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return false
  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: tok.refreshToken,
      }),
    })
    const data = await res.json() as any
    if (data.access_token) {
      tok.accessToken = data.access_token
      if (data.refresh_token) tok.refreshToken = data.refresh_token
      tokenCache.set(userId, tok)
      if (db) {
        await db.update(twitchTokens).set({
          accessToken: tok.accessToken,
          refreshToken: tok.refreshToken!,
          updatedAt: new Date(),
        }).where(eq(twitchTokens.userId, userId))
      }
      return true
    }
    return false
  } catch (err: any) {
    console.error(`[clip] Token refresh failed for ${userId}:`, err.message)
    return false
  }
}

// Restore ALL user tokens from DB on startup and refresh them
export async function restoreTwitchAuth(): Promise<boolean> {
  if (!db) return false
  try {
    const rows = await db.select().from(twitchTokens)
    if (rows.length === 0) {
      console.log('[clip] No saved Twitch tokens found')
      return false
    }

    let restored = 0
    for (const saved of rows) {
      tokenCache.set(saved.userId, {
        accessToken: saved.accessToken,
        refreshToken: saved.refreshToken,
      })
      const refreshed = await refreshUserToken(saved.userId)
      if (refreshed) {
        restored++
        console.log(`[clip] Restored Twitch auth for user ${saved.userId}`)
      } else {
        console.warn(`[clip] Token refresh failed for user ${saved.userId} — needs re-login`)
      }
    }

    // Set legacy globals from first successful token for backward compat
    if (restored > 0) {
      const first = [...tokenCache.entries()].find(([_, t]) => t.accessToken)
      if (first) {
        legacyUserToken = first[1].accessToken
        legacyUserId = first[0]
      }
    }

    console.log(`[clip] Restored ${restored}/${rows.length} user tokens`)
    return restored > 0
  } catch (err: any) {
    console.error('[clip] Failed to restore tokens:', err.message)
    return false
  }
}

// Revoke a user's OAuth token
export async function revokeTwitchAuth(userId: string): Promise<void> {
  tokenCache.delete(userId)
  if (userId === legacyUserId) {
    legacyUserToken = null
    legacyUserId = null
  }
  if (db) {
    await db.delete(twitchTokens).where(eq(twitchTokens.userId, userId))
  }
  console.log(`[clip] Revoked OAuth token for user ${userId}`)
}

// Broadcaster ID cache
const broadcasterCache = new Map<string, { id: string; cachedAt: number }>()

async function getBroadcasterId(channel: string, token: string): Promise<string | null> {
  const cached = broadcasterCache.get(channel)
  if (cached && Date.now() - cached.cachedAt < 600_000) return cached.id

  const res = await fetch(`https://api.twitch.tv/helix/users?login=${channel}`, {
    headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` },
  })

  if (res.status === 401) return null

  const data = await res.json() as any
  const id = data.data?.[0]?.id
  if (id) broadcasterCache.set(channel, { id, cachedAt: Date.now() })
  return id || null
}

export async function createClip(channel: string, forUserId?: string): Promise<{ clipId: string; clipUrl: string; editUrl: string } | null> {
  // Resolve which user's token to use
  const uid = forUserId || legacyUserId
  if (!uid) return null

  let tok = await getTokenForUser(uid)
  if (!tok) return null

  try {
    let broadcasterId = await getBroadcasterId(channel, tok.accessToken)

    // If 401 on broadcaster lookup, try refresh
    if (!broadcasterId) {
      const refreshed = await refreshUserToken(uid)
      if (!refreshed) return null
      tok = tokenCache.get(uid)!
      broadcasterId = await getBroadcasterId(channel, tok.accessToken)
      if (!broadcasterId) return null
    }

    let clipRes = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&has_delay=false`, {
      method: 'POST',
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${tok.accessToken}` },
    })

    // If 401, try refresh and retry
    if (clipRes.status === 401) {
      const refreshed = await refreshUserToken(uid)
      if (!refreshed) return null
      tok = tokenCache.get(uid)!
      clipRes = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&has_delay=false`, {
        method: 'POST',
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${tok.accessToken}` },
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
    console.error(`[clip] Error clipping ${channel} for user ${uid}:`, err.message)
    return null
  }
}

// Periodically refresh all tokens to keep them alive (every 3 hours)
setInterval(async () => {
  for (const [uid, tok] of tokenCache) {
    if (tok.refreshToken) {
      const ok = await refreshUserToken(uid)
      if (ok) console.log(`[clip] Token auto-refreshed for ${uid}`)
      else console.warn(`[clip] Token auto-refresh failed for ${uid}`)
    }
  }
}, 3 * 60 * 60 * 1000)
