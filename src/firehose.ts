import WebSocket from 'ws'

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

// Vibe categories — what the chat is feeling
export type Vibe = 'funny' | 'hype' | 'awkward' | 'win' | 'loss' | 'neutral'

export interface VibeScores {
  funny: number
  hype: number
  awkward: number
  win: number
  loss: number
}

// Pattern matching for chat vibes
const VIBE_PATTERNS: { pattern: RegExp; vibe: Vibe; weight: number }[] = [
  // Funny
  { pattern: /\bLO+L?\b/i, vibe: 'funny', weight: 1 },
  { pattern: /\bLMAO\b/i, vibe: 'funny', weight: 2 },
  { pattern: /\bROFL\b/i, vibe: 'funny', weight: 2 },
  { pattern: /\bHAHA+\b/i, vibe: 'funny', weight: 1 },
  { pattern: /\bKEKW\b/i, vibe: 'funny', weight: 2 },
  { pattern: /\bOMEGALUL\b/i, vibe: 'funny', weight: 2 },
  { pattern: /\bLUL\b/i, vibe: 'funny', weight: 1 },
  { pattern: /💀/g, vibe: 'funny', weight: 2 },
  { pattern: /\b:D\b/, vibe: 'funny', weight: 1 },
  // Hype
  { pattern: /\bOOO+\b/i, vibe: 'hype', weight: 2 },
  { pattern: /\bPOG\w*/i, vibe: 'hype', weight: 2 },
  { pattern: /\bLETS\s*GO+\b/i, vibe: 'hype', weight: 2 },
  { pattern: /\bHOLY\b/i, vibe: 'hype', weight: 1 },
  { pattern: /\bINSANE\b/i, vibe: 'hype', weight: 2 },
  { pattern: /\bALARM\b/i, vibe: 'hype', weight: 2 },
  { pattern: /🚨/g, vibe: 'hype', weight: 2 },
  { pattern: /\bmaxwin\b/i, vibe: 'hype', weight: 2 },
  // Awkward
  { pattern: /\bu+h+\b/i, vibe: 'awkward', weight: 1 },
  { pattern: /\byikes\b/i, vibe: 'awkward', weight: 2 },
  { pattern: /\bmonkaS\b/, vibe: 'awkward', weight: 2 },
  { pattern: /\bweird\b/i, vibe: 'awkward', weight: 1 },
  { pattern: /\beww?\b/i, vibe: 'awkward', weight: 1 },
  { pattern: /\bcringe\b/i, vibe: 'awkward', weight: 2 },
  { pattern: /\?\?\?+/g, vibe: 'awkward', weight: 1 },
  // Win
  { pattern: /\bW{2,}\b/, vibe: 'win', weight: 2 },
  { pattern: /\bWW\b/, vibe: 'win', weight: 2 },
  { pattern: /\bW\s+(TAKE|CHAT|STREAMER)\b/i, vibe: 'win', weight: 2 },
  { pattern: /\bgoat\b/i, vibe: 'win', weight: 1 },
  { pattern: /\bGOATED\b/i, vibe: 'win', weight: 2 },
  // Loss
  { pattern: /\bL{2,}\b/, vibe: 'loss', weight: 2 },
  { pattern: /\bLL\b/, vibe: 'loss', weight: 2 },
  { pattern: /\bL\s+(TAKE|CHAT|STREAMER)\b/i, vibe: 'loss', weight: 2 },
  { pattern: /\bRIP\b/i, vibe: 'loss', weight: 1 },
  { pattern: /\bSadge\b/, vibe: 'loss', weight: 1 },
]

function scoreMessage(text: string): VibeScores {
  const scores: VibeScores = { funny: 0, hype: 0, awkward: 0, win: 0, loss: 0 }
  for (const { pattern, vibe, weight } of VIBE_PATTERNS) {
    if (vibe === 'neutral') continue
    if (pattern.test(text)) {
      scores[vibe] += weight
    }
  }
  return scores
}

export interface ChannelState {
  name: string
  // Rolling window: timestamps of messages in last 60s
  messageTimes: number[]
  // Last 200 messages
  recentMessages: ChatMessage[]
  // Spike detection
  avgRate: number // smoothed average msgs/sec
  lastSpikeAt: number | null
  peakRate: number
  // Vibe tracking — rolling scores over last 60s of messages
  vibeWindow: { time: number; scores: VibeScores }[]
}

const channels = new Map<string, ChannelState>()
let totalMsgsPerSec = 0
let connected = false

function getOrCreateChannel(name: string): ChannelState {
  let state = channels.get(name)
  if (!state) {
    state = {
      name,
      messageTimes: [],
      recentMessages: [],
      avgRate: 0,
      lastSpikeAt: null,
      peakRate: 0,
      vibeWindow: [],
    }
    channels.set(name, state)
  }
  return state
}

function processMessage(msg: ChatMessage) {
  const state = getOrCreateChannel(msg.channel)
  const now = Date.now()

  state.messageTimes.push(now)
  state.recentMessages.push(msg)

  // Score vibes
  const scores = scoreMessage(msg.text)
  const hasVibe = scores.funny + scores.hype + scores.awkward + scores.win + scores.loss > 0
  if (hasVibe) {
    state.vibeWindow.push({ time: now, scores })
  }

  // Keep only last 200 messages
  if (state.recentMessages.length > 200) {
    state.recentMessages.shift()
  }
}

// Clean old timestamps and update rates every second
setInterval(() => {
  const now = Date.now()
  const cutoff = now - 60_000 // 60 second window

  let totalRate = 0

  for (const [name, state] of channels) {
    // Remove timestamps older than 60s
    state.messageTimes = state.messageTimes.filter(t => t > cutoff)

    const currentRate = state.messageTimes.length / 60 // msgs per second over last minute

    // Smoothed average (exponential moving average)
    if (state.avgRate === 0) {
      state.avgRate = currentRate
    } else {
      state.avgRate = state.avgRate * 0.9 + currentRate * 0.1
    }

    // Clean old vibes
    state.vibeWindow = state.vibeWindow.filter(v => v.time > cutoff)

    // Spike detection: current rate > 2x the smoothed average
    if (currentRate > state.avgRate * 2 && currentRate > 1) {
      const wasAlreadySpiking = state.lastSpikeAt && (now - state.lastSpikeAt) < 10_000
      state.lastSpikeAt = now
      if (currentRate > state.peakRate) {
        state.peakRate = currentRate
      }

      // Only emit new spike events (not continuous ones within 10s)
      if (!wasAlreadySpiking && spikeListeners.size > 0) {
        const vibes = getVibes(state)
        const spike = {
          channel: state.name,
          spikeAt: now,
          currentRate: Math.round(currentRate * 100) / 100,
          avgRate: Math.round(state.avgRate * 100) / 100,
          vibe: vibes.dominant,
          vibeIntensity: vibes.intensity,
          clipWorthy: vibes.intensity > 10 && (vibes.dominant === 'hype' || vibes.dominant === 'funny'),
        }
        for (const listener of spikeListeners) {
          listener(spike)
        }
      }
    }

    totalRate += currentRate

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
        msgsPerSec: Math.round((ch.messageTimes.length / 60) * 100) / 100,
        totalLast60s: ch.messageTimes.length,
        vibe: vibes.dominant,
        vibeIntensity: vibes.intensity,
      }
    })
    .sort((a, b) => b.msgsPerSec - a.msgsPerSec)
    .slice(0, limit)

  return { channels: sorted, totalMsgsPerSec: Math.round(totalMsgsPerSec * 100) / 100 }
}

export function getChannel(name: string) {
  const state = channels.get(name) || channels.get(name.toLowerCase())
  if (!state) return null

  const now = Date.now()
  const msgsPerSec = Math.round((state.messageTimes.length / 60) * 100) / 100
  const isSpike = msgsPerSec > state.avgRate * 2 && msgsPerSec > 1

  const vibes = getVibes(state)

  return {
    channel: state.name,
    msgsPerSec,
    avgRate: Math.round(state.avgRate * 100) / 100,
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
        currentRate: Math.round((ch.messageTimes.length / 60) * 100) / 100,
        avgRate: Math.round(ch.avgRate * 100) / 100,
        peakRate: Math.round(ch.peakRate * 100) / 100,
        vibe: vibes.dominant,
        vibeIntensity: vibes.intensity,
        clipWorthy: vibes.intensity > 10 && (vibes.dominant === 'hype' || vibes.dominant === 'funny'),
      }
    })
    .sort((a, b) => b.currentRate - a.currentRate)
}

export function getRecentMessages(channelName: string, limit = 100): string[] {
  const state = channels.get(channelName) || channels.get(channelName.toLowerCase())
  if (!state) return []
  return state.recentMessages.slice(-limit).map(m => `${m.displayName}: ${m.text}`)
}

// Twitch stream start time cache
const streamStartCache = new Map<string, { startedAt: Date; cachedAt: number }>()

export async function getVodTimestamp(channel: string, spikeTimestamp: number): Promise<string | null> {
  try {
    const cached = streamStartCache.get(channel)
    const now = Date.now()

    let startedAt: Date

    // Cache for 10 minutes
    if (cached && now - cached.cachedAt < 600_000) {
      startedAt = cached.startedAt
    } else {
      const res = await fetch('https://gql.twitch.tv/gql', {
        method: 'POST',
        headers: {
          'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `query { user(login: "${channel}") { stream { createdAt } } }`,
        }),
      })
      const data = await res.json() as any
      const createdAt = data?.data?.user?.stream?.createdAt
      if (!createdAt) return null

      startedAt = new Date(createdAt)
      streamStartCache.set(channel, { startedAt, cachedAt: now })
    }

    const diffMs = spikeTimestamp - startedAt.getTime()
    if (diffMs < 0) return null

    const hours = Math.floor(diffMs / 3600000)
    const mins = Math.floor((diffMs % 3600000) / 60000)
    const secs = Math.floor((diffMs % 60000) / 1000)

    return `${hours}h${mins}m${secs}s`
  } catch {
    return null
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
