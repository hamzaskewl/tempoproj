export type { Vibe, VibeScores } from '../tokenizer/index.js'
import type { Vibe, VibeScores } from '../tokenizer/index.js'

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
  messageTimes: { time: number, user: string }[]
  recentMessages: ChatMessage[]
  baseline: number
  burst: number
  sustained: number
  rateSamples: number[]
  sampleCount: number
  firstSeen: number
  lastSpikeAt: number | null
  peakRate: number
  vibeWindow: { time: number; scores: VibeScores }[]
  ewmaMean: number
  ewmaVar: number
  riseTicks: number
  fallTicks: number
  pendingSpike: { startedAt: number; peakBurst: number; peakZ: number; peakAt: number } | null
}

export interface StreamContext {
  viewers: number
  game: string | null
  title: string | null
}

// v2 spike detector constants
export const SPIKE_V2 = process.env.SPIKE_V2 === '1'
export const ALPHA_MEAN = 0.05
export const ALPHA_VAR = 0.02
export const STDDEV_FLOOR = 0.25
export const Z_TRIGGER = 3.0
export const RISE_TICKS_REQUIRED = 2
export const PEAK_FALLOFF = 0.7
export const WARMUP_SAMPLES = 20

// Shared mutable state
export const channels = new Map<string, ChannelState>()
export let totalMsgsPerSec = 0
export let connected = false

export function setTotalMsgsPerSec(v: number) { totalMsgsPerSec = v }
export function setConnected(v: boolean) { connected = v }

// Active channel tracking
const activeChannels = new Set<string>()
export function setActiveChannel(name: string) { activeChannels.add(name.toLowerCase()) }
export function removeActiveChannel(name: string) { activeChannels.delete(name.toLowerCase()) }
export function isActiveChannel(name: string) { return activeChannels.has(name.toLowerCase()) }
export { activeChannels }

export function getOrCreateChannel(name: string): ChannelState {
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
      ewmaMean: 0,
      ewmaVar: 0,
      riseTicks: 0,
      fallTicks: 0,
      pendingSpike: null,
    }
    channels.set(name, state)
  }
  return state
}

// Aggregate vibe scores for a channel
export function getVibes(state: ChannelState): { scores: VibeScores; dominant: Vibe; intensity: number } {
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
    if (score > max) { max = score; dominant = vibe }
  }
  return { scores: totals, dominant: total > 0 ? dominant : 'neutral', intensity: total }
}


