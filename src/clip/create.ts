import { TWITCH_CLIENT_ID, tokenCache, legacyUserId, getTokenForUser, refreshUserToken } from './tokens.js'

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
