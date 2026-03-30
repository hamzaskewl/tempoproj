import WebSocket from 'ws'
import { analyzeMessage } from './tokenizer.js'
export type { Vibe, VibeScores } from './tokenizer.js'
import type { Vibe, VibeScores } from './tokenizer.js'

export interface ChatMessage {
  channel: string
  displayName: string
  text: string
  timestamp: number
  tags?: {
    badges?: string
    color?: string
    emotes?: string
  }
}


export interface ChannelState {
  name: string
  // Rolling window: timestamps + usernames of messages in last 2 min
  messageTimes: { time: number, user: string }[]
  // Last 200 messages
  recentMessages: ChatMessage[]
  // Spike detection — dual window
  baseline: number  // avg of burst samples over last 2 min
  burst: number     // 5s burst rate (instant reaction)
  sustained: number // 30s sustained rate (confirms real moment)
  rateSamples: number[] // rolling window of burst values (last 2 min = 120 samples)
  sampleCount: number   // total samples collected (includes skipped)
  firstSeen: number
  lastSpikeAt: number | null
  peakRate: number
  // Vibe tracking — rolling scores over last 60s of messages
  vibeWindow: { time: number; scores: VibeScores }[]
}

const channels = new Map<string, ChannelState>()
let totalMsgsPerSec = 0
let connected = false

// Channels that get full tracking (set by moments.ts watchlist)
const activeChannels = new Set<string>()
export function setActiveChannel(name: string) { activeChannels.add(name.toLowerCase()) }
export function removeActiveChannel(name: string) { activeChannels.delete(name.toLowerCase()) }
export function isActiveChannel(name: string) { return activeChannels.has(name.toLowerCase()) }

function getOrCreateChannel(name: string): ChannelState {
  let state = channels.get(name)
  if (!state) {
    state = {
      name,
      messageTimes: [],
      recentMessages: [],
      baseline: 0,
      burst: 0,
      sustained: 0,
      rateSamples: [],
      sampleCount: 0,
      firstSeen: Date.now(),
      lastSpikeAt: null,
      peakRate: 0,
      vibeWindow: [],
    }
    channels.set(name, state)
  }
  return state
}

function processMessage(msg: ChatMessage) {
  // Ensure displayName exists for unique chatter tracking
  const userName = (msg.displayName || msg.channel || 'anon').toLowerCase()
  msg.displayName = msg.displayName || userName

  // Tokenize once — used for gift sub detection + vibe scoring
  const { scores, giftSub } = analyzeMessage(msg.text)

  // Skip gifted sub messages entirely — they inflate rates artificially
  if (giftSub) return

  const isActive = activeChannels.has(msg.channel.toLowerCase())

  // Non-active channels: only track message timestamps for rate (no storage)
  if (!isActive) {
    let state = channels.get(msg.channel)
    if (!state) {
      state = {
        name: msg.channel,
        messageTimes: [],
        recentMessages: [],
        baseline: 0,
        burst: 0,
        sustained: 0,
        rateSamples: [],
        sampleCount: 0,
        firstSeen: Date.now(),
        lastSpikeAt: null,
        peakRate: 0,
        vibeWindow: [],
      }
      channels.set(msg.channel, state)
    }
    state.messageTimes.push({ time: Date.now(), user: userName })
    // Keep timestamps lean — only last 30s
    if (state.messageTimes.length > 300) {
      state.messageTimes = state.messageTimes.slice(-100)
    }
    return
  }

  // Active channels: full tracking
  const state = getOrCreateChannel(msg.channel)
  const now = Date.now()

  state.messageTimes.push({ time: now, user: userName })
  state.recentMessages.push(msg)

  const hasVibe = scores.funny + scores.hype + scores.awkward + scores.win + scores.loss > 0
  if (hasVibe) {
    state.vibeWindow.push({ time: now, scores })
  }

  if (state.recentMessages.length > 200) {
    state.recentMessages.shift()
  }
}

// Clean old timestamps and update rates every second
setInterval(() => {
  const now = Date.now()
  const cutoff = now - 60_000 // 60s window for message timestamps

  let totalRate = 0

  for (const [name, state] of channels) {
    const isActive = activeChannels.has(name.toLowerCase())

    // Clean up dead non-active channels aggressively
    if (!isActive) {
      state.messageTimes = state.messageTimes.filter(m => m.time > cutoff)
      if (state.messageTimes.length === 0) {
        channels.delete(name)
      }
      continue
    }

    // Active channels: full processing
    state.messageTimes = state.messageTimes.filter(m => m.time > cutoff)

    // 5s burst rate — count messages but cap each user at 2 per window
    // This way: 1 spammer = max 0.4, but 10 real chatters = 4.0
    const cutoff5s = now - 5_000
    const msgs5s = state.messageTimes.filter(m => m.time > cutoff5s)
    const userCounts5s = new Map<string, number>()
    let capped5s = 0
    for (const m of msgs5s) {
      const count = (userCounts5s.get(m.user) || 0) + 1
      userCounts5s.set(m.user, count)
      if (count <= 2) capped5s++ // cap each user at 2 messages per 5s window
    }
    state.burst = capped5s / 5

    // 30s sustained rate — same capping logic, 3 msgs max per user
    const cutoff30s = now - 30_000
    const msgs30s = state.messageTimes.filter(m => m.time > cutoff30s)
    const userCounts30s = new Map<string, number>()
    let capped30s = 0
    for (const m of msgs30s) {
      const count = (userCounts30s.get(m.user) || 0) + 1
      userCounts30s.set(m.user, count)
      if (count <= 3) capped30s++ // cap each user at 3 messages per 30s window
    }
    state.sustained = capped30s / 30

    state.sampleCount++

    // Skip first 2 samples — burst is meaningless early on
    if (state.sampleCount > 2) {
      state.rateSamples.push(state.burst)
      // Keep last 30s of samples
      if (state.rateSamples.length > 30) {
        state.rateSamples.shift()
      }
    }

    // Baseline: average of non-zero burst samples over last 2 min
    // Zeros = dead silence, shouldn't drag baseline down
    if (state.rateSamples.length >= 15) {
      const active = state.rateSamples.filter(r => r > 0)
      if (active.length >= 10) {
        const sum = active.reduce((a, b) => a + b, 0)
        state.baseline = sum / active.length
      }
    }

    // Clean old vibes
    state.vibeWindow = state.vibeWindow.filter(v => v.time > cutoff)

    // Spike: burst > 35% above baseline
    const warmedUp = state.rateSamples.length >= 15
    const isSpike = warmedUp && state.burst > state.baseline * Math.max(1.5, 2.5 - (state.baseline * 0.1)) && state.burst > 1

    if (isSpike) {
      const wasAlreadySpiking = state.lastSpikeAt && (now - state.lastSpikeAt) < 30_000
      state.lastSpikeAt = now
      if (state.burst > state.peakRate) {
        state.peakRate = state.burst
      }

      // Only emit new spike events (debounce 30s)
      // Check viewer count — only care about streams with 1000+ viewers
      if (!wasAlreadySpiking && spikeListeners.size > 0) {
        const channelName = state.name
        const burstSnap = state.burst
        const sustainedSnap = state.sustained
        const baselineSnap = state.baseline
        const peakSnap = state.peakRate

        getStreamContext(channelName).then(ctx => {
          if (!ctx) return // skip offline streams

          const vibes = getVibes(state)
          const chatSnapshot = state.recentMessages.slice(-50).map(m => `${m.displayName}: ${m.text}`)
          const spike = {
            channel: channelName,
            spikeAt: now,
            viewers: ctx.viewers,
            burst: Math.round(burstSnap * 100) / 100,
            sustained: Math.round(sustainedSnap * 100) / 100,
            baseline: Math.round(baselineSnap * 100) / 100,
            jumpPercent: Math.round(((burstSnap - baselineSnap) / baselineSnap) * 100),
            vibe: vibes.dominant,
            vibeIntensity: vibes.intensity,
            chatSnapshot,
            game: ctx.game,
            streamTitle: ctx.title,
          }
          for (const listener of spikeListeners) {
            listener(spike)
          }
        }).catch(() => {})
      }
    }

    totalRate += state.burst

    // Clean up dead channels (no messages in 5 min)
    if (state.messageTimes.length === 0 && state.recentMessages.length === 0) {
      channels.delete(name)
    }
  }

  totalMsgsPerSec = totalRate
}, 1000)

export function connectFirehose(instance = 'logs.spanix.team') {
  const url = `wss://${instance}/firehose?jsonBasic=true`
  console.log(`[firehose] Connecting to ${url}...`)

  const ws = new WebSocket(url)

  ws.on('open', () => {
    connected = true
    console.log('[firehose] Connected!')
  })

  ws.on('message', (data) => {
    try {
      const msg: ChatMessage = JSON.parse(data.toString())
      if (msg.channel && msg.text) {
        processMessage(msg)
      }
    } catch {
      // skip malformed messages
    }
  })

  ws.on('close', () => {
    connected = false
    console.log('[firehose] Disconnected. Reconnecting in 3s...')
    setTimeout(() => connectFirehose(instance), 3000)
  })

  ws.on('error', (err) => {
    console.error('[firehose] Error:', err.message)
    ws.close()
  })

  return ws
}

// Aggregate vibe scores for a channel
function getVibes(state: ChannelState): { scores: VibeScores; dominant: Vibe; intensity: number } {
  const totals: VibeScores = { funny: 0, hype: 0, awkward: 0, win: 0, loss: 0 }
  for (const { scores } of state.vibeWindow) {
    totals.funny += scores.funny
    totals.hype += scores.hype
    totals.awkward += scores.awkward
    totals.win += scores.win
    totals.loss += scores.loss
  }

  const total = totals.funny + totals.hype + totals.awkward + totals.win + totals.loss
  let dominant: Vibe = 'neutral'
  let max = 0
  for (const [vibe, score] of Object.entries(totals) as [Vibe, number][]) {
    if (score > max) {
      max = score
      dominant = vibe
    }
  }

  return { scores: totals, dominant: total > 0 ? dominant : 'neutral', intensity: total }
}

// Public API for routes to query state
export function getTrending(limit = 20) {
  const sorted = [...channels.values()]
    .map(ch => {
      const vibes = getVibes(ch)
      return {
        channel: ch.name,
        burst: Math.round(ch.burst * 100) / 100,
        sustained: Math.round(ch.sustained * 100) / 100,
        baseline: Math.round(ch.baseline * 100) / 100,
        vibe: vibes.dominant,
        vibeIntensity: vibes.intensity,
      }
    })
    .sort((a, b) => b.burst - a.burst)
    .slice(0, limit)

  return { channels: sorted, totalMsgsPerSec: Math.round(totalMsgsPerSec * 100) / 100 }
}

export function getChannel(name: string) {
  const state = channels.get(name) || channels.get(name.toLowerCase())
  if (!state) return null

  const isSpike = state.rateSamples.length >= 15 && state.baseline > 3 && state.burst > state.baseline * Math.max(1.5, 2.5 - (state.baseline * 0.1))

  const vibes = getVibes(state)

  return {
    channel: state.name,
    burst: Math.round(state.burst * 100) / 100,
    sustained: Math.round(state.sustained * 100) / 100,
    baseline: Math.round(state.baseline * 100) / 100,
    jumpPercent: state.baseline > 0 ? Math.round(((state.burst - state.baseline) / state.baseline) * 100) : 0,
    isSpike,
    lastSpikeAt: state.lastSpikeAt,
    peakRate: Math.round(state.peakRate * 100) / 100,
    vibe: vibes.dominant,
    vibeScores: vibes.scores,
    vibeIntensity: vibes.intensity,
    recentMessages: state.recentMessages.slice(-50).map(m => ({
      user: m.displayName,
      text: m.text,
      timestamp: m.timestamp,
    })),
    messageCount: state.recentMessages.length,
  }
}

export function getSpikes(withinMinutes = 5) {
  const cutoff = Date.now() - withinMinutes * 60_000

  return [...channels.values()]
    .filter(ch => ch.lastSpikeAt && ch.lastSpikeAt > cutoff)
    .map(ch => {
      const vibes = getVibes(ch)
      return {
        channel: ch.name,
        spikeAt: ch.lastSpikeAt,
        burst: Math.round(ch.burst * 100) / 100,
        sustained: Math.round(ch.sustained * 100) / 100,
        baseline: Math.round(ch.baseline * 100) / 100,
        jumpPercent: ch.baseline > 0 ? Math.round(((ch.burst - ch.baseline) / ch.baseline) * 100) : 0,
        peakRate: Math.round(ch.peakRate * 100) / 100,
        vibe: vibes.dominant,
        vibeIntensity: vibes.intensity,
      }
    })
    .sort((a, b) => b.burst - a.burst)
}

export function getRecentMessages(channelName: string, limit = 100): string[] {
  const state = channels.get(channelName) || channels.get(channelName.toLowerCase())
  if (!state) return []
  return state.recentMessages.slice(-limit)
    .filter(m => !analyzeMessage(m.text).giftSub)
    .map(m => `${m.displayName}: ${m.text}`)
}

// Twitch stream context cache (viewers, game, title)
export interface StreamContext {
  viewers: number
  game: string | null
  title: string | null
}

const streamContextCache = new Map<string, { ctx: StreamContext; cachedAt: number }>()

export async function getStreamContext(channel: string): Promise<StreamContext | null> {
  try {
    const cached = streamContextCache.get(channel)
    const now = Date.now()

    if (cached && now - cached.cachedAt < 120_000) {
      return cached.ctx
    }

    const res = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: {
        'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
        'Content-Type': 'application/json',
      },
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
  } catch {
    return null
  }
}

export async function getViewerCount(channel: string): Promise<number | null> {
  const ctx = await getStreamContext(channel)
  return ctx?.viewers ?? null
}

// Twitch stream start time + VOD ID cache
const streamStartCache = new Map<string, { startedAt: Date; vodId: string | null; cachedAt: number }>()

async function getStreamInfo(channel: string): Promise<{ startedAt: Date; vodId: string | null } | null> {
  const cached = streamStartCache.get(channel)
  const now = Date.now()

  if (cached && now - cached.cachedAt < 600_000) {
    return { startedAt: cached.startedAt, vodId: cached.vodId }
  }

  const res = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: {
      'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
      'Content-Type': 'application/json',
    },
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
  } catch {
    return null
  }
}

// Build a proper VOD URL: https://www.twitch.tv/videos/123456?t=1h2m3s
// Falls back to channel URL if no VOD is published
export async function getVodUrl(channel: string, timestamp: string): Promise<string> {
  try {
    const info = await getStreamInfo(channel)
    if (info?.vodId) {
      return `https://www.twitch.tv/videos/${info.vodId}?t=${timestamp}`
    }
  } catch {}
  return `https://twitch.tv/${channel}?t=${timestamp}`
}

// Check if a channel is currently live (fresh query, no cache)
export async function isStreamLive(channel: string): Promise<boolean> {
  try {
    const res = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: {
        'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `query { user(login: "${channel}") { stream { id } } }`,
      }),
    })
    const data = await res.json() as any
    return !!data?.data?.user?.stream?.id
  } catch {
    return true // assume live on error to avoid premature disconnects
  }
}

// Spike event listeners for SSE alerts
type SpikeListener = (spike: any) => void
const spikeListeners: Set<SpikeListener> = new Set()

export function onSpike(listener: SpikeListener) {
  spikeListeners.add(listener)
  return () => spikeListeners.delete(listener)
}

export function isConnected() {
  return connected
}

export function getStats() {
  return {
    connected,
    totalChannels: channels.size,
    totalMsgsPerSec: Math.round(totalMsgsPerSec * 100) / 100,
  }
}
