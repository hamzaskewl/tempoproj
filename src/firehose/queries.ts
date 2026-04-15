import { analyzeMessage } from '../tokenizer/index'
import {
  channels, totalMsgsPerSec, connected, getVibes,
  SPIKE_V2, STDDEV_FLOOR, Z_TRIGGER, WARMUP_SAMPLES, RISE_TICKS_REQUIRED,
} from './state'
import type { ChannelState } from './state'

export function getTrending(limit = 20) {
  const ch: Map<string, ChannelState> = (globalThis as any).__firehose_channels ?? channels
  const sorted = [...ch.values()]
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
  const msgs = (globalThis as any).__firehose_totalMsgsPerSec ?? totalMsgsPerSec
  return { channels: sorted, totalMsgsPerSec: Math.round(msgs * 100) / 100 }
}

export function getChannel(name: string) {
  const ch: Map<string, ChannelState> = (globalThis as any).__firehose_channels ?? channels
  const state = ch.get(name) || ch.get(name.toLowerCase())
  if (!state) return null
  const baseline = SPIKE_V2 ? state.ewmaMean : state.baseline
  const stddev = Math.sqrt(state.ewmaVar) + STDDEV_FLOOR
  const z = (state.burst - state.ewmaMean) / stddev
  const confidence = Math.max(0, Math.min(1, (z - Z_TRIGGER) / 4))
  let isSpike: boolean
  if (SPIKE_V2) {
    const absFloor = Math.max(2, state.ewmaMean * 1.4)
    isSpike = state.sampleCount >= WARMUP_SAMPLES && z >= Z_TRIGGER && state.burst >= absFloor && state.riseTicks >= RISE_TICKS_REQUIRED
  } else {
    isSpike = state.rateSamples.length >= 15 && state.baseline > 3 && state.burst > state.baseline * Math.max(1.5, 2.5 - (state.baseline * 0.1))
  }
  const vibes = getVibes(state)
  const denom = baseline > 0.01 ? baseline : 0.01
  return {
    channel: state.name,
    burst: Math.round(state.burst * 100) / 100,
    sustained: Math.round(state.sustained * 100) / 100,
    baseline: Math.round(baseline * 100) / 100,
    jumpPercent: baseline > 0 ? Math.round(((state.burst - baseline) / denom) * 100) : 0,
    isSpike,
    lastSpikeAt: state.lastSpikeAt,
    peakRate: Math.round(state.peakRate * 100) / 100,
    vibe: vibes.dominant,
    vibeScores: vibes.scores,
    vibeIntensity: vibes.intensity,
    recentMessages: state.recentMessages.slice(-50).map(m => ({
      user: m.displayName, text: m.text, timestamp: m.timestamp,
    })),
    messageCount: state.recentMessages.length,
    detector: SPIKE_V2 ? 'v2' : 'v1',
    zScore: Math.round(z * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
  }
}

export function getSpikes(withinMinutes = 5) {
  const ch: Map<string, ChannelState> = (globalThis as any).__firehose_channels ?? channels
  const cutoff = Date.now() - withinMinutes * 60_000
  return [...ch.values()]
    .filter(ch => ch.lastSpikeAt && ch.lastSpikeAt > cutoff)
    .map(ch => {
      const vibes = getVibes(ch)
      const baseline = SPIKE_V2 ? ch.ewmaMean : ch.baseline
      const stddev = Math.sqrt(ch.ewmaVar) + STDDEV_FLOOR
      const z = (ch.burst - ch.ewmaMean) / stddev
      const confidence = Math.max(0, Math.min(1, (z - Z_TRIGGER) / 4))
      const denom = baseline > 0.01 ? baseline : 0.01
      return {
        channel: ch.name, spikeAt: ch.lastSpikeAt,
        burst: Math.round(ch.burst * 100) / 100,
        sustained: Math.round(ch.sustained * 100) / 100,
        baseline: Math.round(baseline * 100) / 100,
        jumpPercent: baseline > 0 ? Math.round(((ch.burst - baseline) / denom) * 100) : 0,
        peakRate: Math.round(ch.peakRate * 100) / 100,
        vibe: vibes.dominant, vibeIntensity: vibes.intensity,
        detector: SPIKE_V2 ? 'v2' : 'v1',
        zScore: Math.round(z * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
      }
    })
    .sort((a, b) => b.burst - a.burst)
}

export function getRecentMessages(channelName: string, limit = 100): string[] {
  const ch: Map<string, ChannelState> = (globalThis as any).__firehose_channels ?? channels
  const state = ch.get(channelName) || ch.get(channelName.toLowerCase())
  if (!state) return []
  return state.recentMessages.slice(-limit)
    .filter(m => !analyzeMessage(m.text).giftSub)
    .map(m => `${m.displayName}: ${m.text}`)
}

export function isConnected() { return (globalThis as any).__firehose_connected ?? connected }

export function getStats() {
  const g = globalThis as any
  const conn = g.__firehose_connected ?? connected
  const msgs = g.__firehose_totalMsgsPerSec ?? totalMsgsPerSec
  const ch: Map<string, ChannelState> = g.__firehose_channels ?? channels
  return {
    connected: conn,
    totalChannels: ch.size,
    totalMsgsPerSec: Math.round(msgs * 100) / 100,
  }
}
