import type { StreamContext } from './state.js'

// Stream context cache
const streamContextCache = new Map<string, { ctx: StreamContext; cachedAt: number }>()

export async function getStreamContext(channel: string): Promise<StreamContext | null> {
  try {
    const cached = streamContextCache.get(channel)
    const now = Date.now()
    if (cached && now - cached.cachedAt < 120_000) return cached.ctx
    const res = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query { user(login: "${channel}") { stream { viewersCount game { displayName } title } } }`,
      }),
    })
    const data = await res.json() as any
    const stream = data?.data?.user?.stream
    if (!stream) return null
    const ctx: StreamContext = {
      viewers: stream.viewersCount || 0,
      game: stream.game?.displayName || null,
      title: stream.title || null,
    }
    streamContextCache.set(channel, { ctx, cachedAt: now })
    return ctx
  } catch { return null }
}

export async function getViewerCount(channel: string): Promise<number | null> {
  const ctx = await getStreamContext(channel)
  return ctx?.viewers ?? null
}

// Stream start time + VOD cache
const streamStartCache = new Map<string, { startedAt: Date; vodId: string | null; cachedAt: number }>()

export async function getStreamInfo(channel: string): Promise<{ startedAt: Date; vodId: string | null } | null> {
  const cached = streamStartCache.get(channel)
  const now = Date.now()
  if (cached && now - cached.cachedAt < 600_000) {
    return { startedAt: cached.startedAt, vodId: cached.vodId }
  }
  const res = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query { user(login: "${channel}") { stream { createdAt archiveVideo { id } } } }`,
    }),
  })
  const data = await res.json() as any
  const createdAt = data?.data?.user?.stream?.createdAt
  if (!createdAt) return null
  const startedAt = new Date(createdAt)
  const vodId = data?.data?.user?.stream?.archiveVideo?.id || null
  streamStartCache.set(channel, { startedAt, vodId, cachedAt: now })
  return { startedAt, vodId }
}

export async function getVodTimestamp(channel: string, spikeTimestamp: number): Promise<string | null> {
  try {
    const info = await getStreamInfo(channel)
    if (!info) return null
    const diffMs = spikeTimestamp - info.startedAt.getTime()
    if (diffMs < 0) return null
    const hours = Math.floor(diffMs / 3600000)
    const mins = Math.floor((diffMs % 3600000) / 60000)
    const secs = Math.floor((diffMs % 60000) / 1000)
    return `${hours}h${mins}m${secs}s`
  } catch { return null }
}

export async function getVodUrl(channel: string, timestamp: string): Promise<string> {
  try {
    const info = await getStreamInfo(channel)
    if (info?.vodId) return `https://www.twitch.tv/videos/${info.vodId}?t=${timestamp}`
  } catch {}
  return `https://twitch.tv/${channel}?t=${timestamp}`
}

export async function isStreamLive(channel: string): Promise<boolean> {
  try {
    const res = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query { user(login: "${channel}") { stream { id } } }`,
      }),
    })
    const data = await res.json() as any
    return !!data?.data?.user?.stream?.id
  } catch { return true }
}
