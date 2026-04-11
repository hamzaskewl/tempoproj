import { analyzeMessage } from '../tokenizer/index.js'
import { getStreamContext } from './stream.js'
import {
  channels, activeChannels, getOrCreateChannel, getVibes,
  setTotalMsgsPerSec,
  SPIKE_V2, ALPHA_MEAN, ALPHA_VAR, STDDEV_FLOOR, Z_TRIGGER,
  RISE_TICKS_REQUIRED, PEAK_FALLOFF, WARMUP_SAMPLES,
  type ChatMessage, type ChannelState,
} from './state.js'

// Per-user rate limiting — drop spam before it hits the tokenizer
const userMsgTimes = new Map<string, number[]>()
const USER_RATE_LIMIT = 5, USER_RATE_WINDOW = 5_000

function isUserSpamming(channelUser: string): boolean {
  const now = Date.now()
  const times = userMsgTimes.get(channelUser)
  if (!times) { userMsgTimes.set(channelUser, [now]); return false }
  const recent = times.filter(t => t > now - USER_RATE_WINDOW)
  recent.push(now)
  userMsgTimes.set(channelUser, recent)
  return recent.length > USER_RATE_LIMIT
}
// Clean up rate limit map every 30s
setInterval(() => {
  const cutoff = Date.now() - USER_RATE_WINDOW
  for (const [key, times] of userMsgTimes) {
    const recent = times.filter(t => t > cutoff)
    if (recent.length === 0) userMsgTimes.delete(key)
    else userMsgTimes.set(key, recent)
  }
}, 30_000)

// Spike event listeners
type SpikeListener = (spike: any) => void
const spikeListeners: Set<SpikeListener> = new Set()
export function onSpike(listener: SpikeListener) {
  spikeListeners.add(listener)
  return () => spikeListeners.delete(listener)
}

export function processMessage(msg: ChatMessage) {
  const userName = (msg.displayName || msg.channel || 'anon').toLowerCase()
  msg.displayName = msg.displayName || userName
  if (isUserSpamming(`${msg.channel}:${userName}`)) return
  const { scores, giftSub } = analyzeMessage(msg.text)
  if (giftSub) return
  const isActive = activeChannels.has(msg.channel.toLowerCase())
  // Non-active channels: only track timestamps for rate discovery
  if (!isActive) {
    const state = getOrCreateChannel(msg.channel)
    state.messageTimes.push({ time: Date.now(), user: userName })
    if (state.messageTimes.length > 500) state.messageTimes = state.messageTimes.slice(-200)
    return
  }

  const state = getOrCreateChannel(msg.channel)
  const now = Date.now()
  state.messageTimes.push({ time: now, user: userName })
  state.recentMessages.push(msg)

  const hasVibe = scores.funny + scores.hype + scores.awkward + scores.win + scores.loss > 0
  if (hasVibe) state.vibeWindow.push({ time: now, scores })
  if (state.recentMessages.length > 200) state.recentMessages.shift()
}

// Main detection loop — runs every second
setInterval(() => {
  const now = Date.now()
  const cutoff = now - 60_000
  let totalRate = 0

  for (const [name, state] of channels) {
    const isActive = activeChannels.has(name.toLowerCase())

    if (!isActive) {
      state.messageTimes = state.messageTimes.filter(m => m.time > cutoff)
      if (state.messageTimes.length === 0) channels.delete(name)
      continue
    }

    state.messageTimes = state.messageTimes.filter(m => m.time > cutoff)

    // 5s burst rate with per-user cap
    const cutoff5s = now - 5_000
    const msgs5s = state.messageTimes.filter(m => m.time > cutoff5s)
    const userCounts5s = new Map<string, number>()
    let capped5s = 0
    for (const m of msgs5s) {
      const count = (userCounts5s.get(m.user) || 0) + 1
      userCounts5s.set(m.user, count)
      if (count <= 3) capped5s++
    }
    state.burst = capped5s / 5

    // 30s sustained rate
    const cutoff30s = now - 30_000
    const msgs30s = state.messageTimes.filter(m => m.time > cutoff30s)
    const userCounts30s = new Map<string, number>()
    let capped30s = 0
    for (const m of msgs30s) {
      const count = (userCounts30s.get(m.user) || 0) + 1
      userCounts30s.set(m.user, count)
      if (count <= 5) capped30s++
    }
    state.sustained = capped30s / 30

    state.sampleCount++
    if (state.sampleCount > 2) {
      state.rateSamples.push(state.burst)
      if (state.rateSamples.length > 30) state.rateSamples.shift()
    }
    if (state.rateSamples.length >= 15) {
      state.baseline = state.rateSamples.reduce((a, b) => a + b, 0) / state.rateSamples.length
    }

    // v2 EWMA + Welford variance
    if (state.sampleCount < WARMUP_SAMPLES) {
      state.ewmaMean = ((state.ewmaMean * (state.sampleCount - 1)) + state.burst) / state.sampleCount
    } else {
      const delta = state.burst - state.ewmaMean
      state.ewmaMean += ALPHA_MEAN * delta
      state.ewmaVar = (1 - ALPHA_VAR) * (state.ewmaVar + ALPHA_VAR * delta * delta)
    }
    const v2Stddev = Math.sqrt(state.ewmaVar) + STDDEV_FLOOR
    const v2Z = (state.burst - state.ewmaMean) / v2Stddev

    if (state.burst > state.ewmaMean + v2Stddev) state.riseTicks++
    else state.riseTicks = 0

    state.vibeWindow = state.vibeWindow.filter(v => v.time > cutoff)

    // Spike detection
    let isSpike = false
    if (SPIKE_V2) {
      const absFloor = Math.max(2, state.ewmaMean * 1.4)
      const isCandidate = state.sampleCount >= WARMUP_SAMPLES && v2Z >= Z_TRIGGER && state.burst >= absFloor
      isSpike = isCandidate && state.riseTicks >= RISE_TICKS_REQUIRED
    } else {
      isSpike = state.rateSamples.length >= 15 && state.burst > state.baseline * Math.max(1.5, 2.5 - (state.baseline * 0.1)) && state.burst > 1
    }

    if (isSpike) {
      const wasAlreadySpiking = state.lastSpikeAt && (now - state.lastSpikeAt) < 30_000
      state.lastSpikeAt = now
      if (state.burst > state.peakRate) state.peakRate = state.burst

      if (!wasAlreadySpiking && spikeListeners.size > 0) {
        const channelName = state.name
        const burstSnap = state.burst, sustainedSnap = state.sustained
        const baselineSnap = SPIKE_V2 ? state.ewmaMean : state.baseline
        const zSnap = v2Z
        const confidenceSnap = Math.max(0, Math.min(1, (v2Z - Z_TRIGGER) / 4))
        const riseTicksSnap = state.riseTicks
        if (SPIKE_V2) {
          state.pendingSpike = { startedAt: now, peakBurst: burstSnap, peakZ: zSnap, peakAt: now }
          state.fallTicks = 0
        }
        getStreamContext(channelName).then(ctx => {
          if (!ctx) return
          const vibes = getVibes(state)
          const chatSnapshot = state.recentMessages.slice(-50).map(m => `${m.displayName}: ${m.text}`)
          const denom = baselineSnap > 0.01 ? baselineSnap : 0.01
          const spike = {
            channel: channelName, spikeAt: now, viewers: ctx.viewers,
            burst: Math.round(burstSnap * 100) / 100, sustained: Math.round(sustainedSnap * 100) / 100,
            baseline: Math.round(baselineSnap * 100) / 100,
            jumpPercent: Math.round(((burstSnap - baselineSnap) / denom) * 100),
            vibe: vibes.dominant, vibeIntensity: vibes.intensity, chatSnapshot,
            game: ctx.game, streamTitle: ctx.title,
            detector: SPIKE_V2 ? 'v2' : 'v1',
            zScore: Math.round(zSnap * 100) / 100, confidence: Math.round(confidenceSnap * 100) / 100,
            peakBurst: Math.round(burstSnap * 100) / 100, riseDurationMs: riseTicksSnap * 1000,
          }
          for (const listener of spikeListeners) listener(spike)
        }).catch(() => {})
      }
    }

    // v2 peak tracking
    if (SPIKE_V2 && state.pendingSpike) {
      if (state.burst > state.pendingSpike.peakBurst) {
        state.pendingSpike.peakBurst = state.burst
        state.pendingSpike.peakZ = v2Z
        state.pendingSpike.peakAt = now
      }
      if (state.burst < PEAK_FALLOFF * state.pendingSpike.peakBurst) state.fallTicks++
      else state.fallTicks = 0
      if (state.fallTicks >= 2 || now - state.pendingSpike.startedAt > 15_000) {
        state.pendingSpike = null; state.fallTicks = 0
      }
    }

    totalRate += state.burst
    if (state.messageTimes.length === 0 && state.recentMessages.length === 0) channels.delete(name)
  }

  setTotalMsgsPerSec(totalRate)
}, 1000)
