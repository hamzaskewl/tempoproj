// Emote fetching from 7TV, BTTV, FFZ APIs + Twitch ID resolution

import { registerEmote, registerChannelEmote, knownEmotes } from './vibe-map.js'

// --- Fetch emotes from 7TV/BTTV/FFZ APIs ---

async function fetch7TVGlobal(): Promise<string[]> {
  try {
    const res = await fetch('https://7tv.io/v3/emote-sets/global')
    const data = await res.json() as any
    return (data.emotes || []).map((e: any) => e.name)
  } catch (err: any) {
    console.error('[emotes] 7TV global fetch failed:', err.message)
    return []
  }
}

async function fetch7TVChannel(twitchId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://7tv.io/v3/users/twitch/${twitchId}`)
    const data = await res.json() as any
    return (data.emote_set?.emotes || []).map((e: any) => e.name)
  } catch (err: any) {
    console.error(`[emotes] 7TV channel ${twitchId} fetch failed:`, err.message)
    return []
  }
}

async function fetchBTTVGlobal(): Promise<string[]> {
  try {
    const res = await fetch('https://api.betterttv.net/3/cached/emotes/global')
    const data = await res.json() as any
    return (data || []).map((e: any) => e.code)
  } catch (err: any) {
    console.error('[emotes] BTTV global fetch failed:', err.message)
    return []
  }
}

async function fetchBTTVChannel(twitchId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`)
    const data = await res.json() as any
    const shared = (data.sharedEmotes || []).map((e: any) => e.code)
    const channel = (data.channelEmotes || []).map((e: any) => e.code)
    return [...shared, ...channel]
  } catch (err: any) {
    console.error(`[emotes] BTTV channel ${twitchId} fetch failed:`, err.message)
    return []
  }
}

async function fetchFFZGlobal(): Promise<string[]> {
  try {
    const res = await fetch('https://api.frankerfacez.com/v1/set/global')
    const data = await res.json() as any
    const emotes: string[] = []
    for (const set of Object.values(data.sets || {}) as any[]) {
      for (const e of (set.emoticons || [])) emotes.push(e.name)
    }
    return emotes
  } catch (err: any) {
    console.error('[emotes] FFZ global fetch failed:', err.message)
    return []
  }
}

async function fetchFFZChannel(twitchId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.frankerfacez.com/v1/room/id/${twitchId}`)
    const data = await res.json() as any
    const emotes: string[] = []
    for (const set of Object.values(data.sets || {}) as any[]) {
      for (const e of (set.emoticons || [])) emotes.push(e.name)
    }
    return emotes
  } catch (err: any) {
    console.error(`[emotes] FFZ channel ${twitchId} fetch failed:`, err.message)
    return []
  }
}

// Load all global emotes from 7TV/BTTV/FFZ
export async function loadGlobalEmotes(): Promise<void> {
  console.log('[emotes] Loading global emotes from 7TV, BTTV, FFZ...')
  const [stv, bttv, ffz] = await Promise.all([
    fetch7TVGlobal(),
    fetchBTTVGlobal(),
    fetchFFZGlobal(),
  ])

  for (const name of [...stv, ...bttv, ...ffz]) registerEmote(name)
  console.log(`[emotes] Loaded ${knownEmotes.size} global emotes (7TV: ${stv.length}, BTTV: ${bttv.length}, FFZ: ${ffz.length})`)
}

// Resolve Twitch login -> user ID via GQL
async function resolveTwitchId(login: string): Promise<string | null> {
  try {
    const res = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: {
        'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: `query { user(login: "${login}") { id } }` }),
    })
    const data = await res.json() as any
    return data?.data?.user?.id || null
  } catch {
    return null
  }
}

// Load emotes for a specific channel (resolves Twitch ID automatically)
export async function loadChannelEmotes(channel: string, twitchId?: string): Promise<void> {
  if (!twitchId) {
    twitchId = await resolveTwitchId(channel) || undefined
    if (!twitchId) {
      console.error(`[emotes] Could not resolve Twitch ID for ${channel}`)
      return
    }
  }
  const [stv, bttv, ffz] = await Promise.all([
    fetch7TVChannel(twitchId),
    fetchBTTVChannel(twitchId),
    fetchFFZChannel(twitchId),
  ])

  for (const name of [...stv, ...bttv, ...ffz]) registerChannelEmote(channel, name)
  const total = stv.length + bttv.length + ffz.length
  console.log(`[emotes] Loaded ${total} emotes for ${channel} (7TV: ${stv.length}, BTTV: ${bttv.length}, FFZ: ${ffz.length})`)
}
