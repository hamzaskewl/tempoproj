// Auto-clip via Twitch Helix API

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || ''
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || ''

let userToken: string | null = null
let userId: string | null = null

export function setTwitchAuth(token: string, id: string) {
  userToken = token
  userId = id
}

export function hasTwitchAuth() {
  return !!userToken
}

export function getTwitchAuth() {
  return { clientId: TWITCH_CLIENT_ID, clientSecret: TWITCH_CLIENT_SECRET, userToken, userId }
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

    // Create live clip immediately — no delay
    const clipRes = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&has_delay=false`, {
      method: 'POST',
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${userToken}` },
    })
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
