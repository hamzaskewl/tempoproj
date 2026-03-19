import { onSpike, getRecentMessages, getVodTimestamp } from './firehose.js'

export interface Moment {
  id: number
  channel: string
  timestamp: string
  spikeAt: number
  // Clip range — VOD timestamps for a window around the moment
  clipStart: string | null // ~10s before spike
  clipEnd: string | null   // ~30s after spike
  clipStartUrl: string | null
  clipEndUrl: string | null
  vodTimestamp: string | null
  vodUrl: string | null
  jumpPercent: number
  currentRate: number
  baseline: number
  vibe: string
  vibeIntensity: number
  clipWorthy: boolean
  summary: string | null
  sentiment: string | null
  topTopics: string[]
  chatSnapshot: string[]
}

const moments: Moment[] = []
let nextId = 1

function msToVodTime(ms: number): string {
  const hours = Math.floor(ms / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${hours}h${mins}m${secs}s`
}

// Auto-capture moments when spikes happen
export function startMomentCapture() {
  console.log('[moments] Auto-capture enabled — storing moments on spike detection')

  onSpike(async (spike) => {
    // Only capture interesting spikes (40%+ jump)
    if (spike.jumpPercent < 40) return

    const id = nextId++
    const chatSnapshot = getRecentMessages(spike.channel, 30)

    // clipWorthy: hype, funny, OR awkward with high intensity
    const clipWorthy = spike.vibeIntensity > 10 &&
      (spike.vibe === 'hype' || spike.vibe === 'funny' || spike.vibe === 'awkward')

    // Create moment immediately with what we have
    const moment: Moment = {
      id,
      channel: spike.channel,
      timestamp: new Date(spike.spikeAt).toISOString(),
      spikeAt: spike.spikeAt,
      clipStart: null,
      clipEnd: null,
      clipStartUrl: null,
      clipEndUrl: null,
      vodTimestamp: null,
      vodUrl: null,
      jumpPercent: spike.jumpPercent,
      currentRate: spike.currentRate,
      baseline: spike.baseline,
      vibe: spike.vibe,
      vibeIntensity: spike.vibeIntensity,
      clipWorthy,
      summary: null,
      sentiment: null,
      topTopics: [],
      chatSnapshot,
    }

    moments.push(moment)
    console.log(`[moments] #${id} captured: ${spike.channel} +${spike.jumpPercent}% (${spike.vibe})${clipWorthy ? ' [CLIP-WORTHY]' : ''}`)

    // Enrich async — VOD timestamp + clip range + LLM summary
    try {
      const vodTimestamp = await getVodTimestamp(spike.channel, spike.spikeAt)
      if (vodTimestamp) {
        moment.vodTimestamp = vodTimestamp
        moment.vodUrl = `https://twitch.tv/${spike.channel}?t=${vodTimestamp}`

        // Calculate clip range: 10s before spike to 30s after
        const startOffset = spike.spikeAt - 10_000 // 10s before
        const endOffset = spike.spikeAt + 30_000   // 30s after

        const startVod = await getVodTimestamp(spike.channel, startOffset)
        const endVod = await getVodTimestamp(spike.channel, endOffset)

        moment.clipStart = startVod
        moment.clipEnd = endVod
        moment.clipStartUrl = startVod ? `https://twitch.tv/${spike.channel}?t=${startVod}` : null
        moment.clipEndUrl = endVod ? `https://twitch.tv/${spike.channel}?t=${endVod}` : null
      }
    } catch {}

    // LLM summary disabled for now — only runs when user explicitly calls /summarize
    // to avoid draining session key USDC on auto-captures

    // Keep max 100 moments in memory
    if (moments.length > 100) {
      moments.shift()
    }
  })
}

export function getMoments(options?: { channel?: string; clipWorthyOnly?: boolean; limit?: number }) {
  let result = [...moments]

  if (options?.channel) {
    result = result.filter(m => m.channel.toLowerCase() === options.channel!.toLowerCase())
  }
  if (options?.clipWorthyOnly) {
    result = result.filter(m => m.clipWorthy)
  }

  // Most recent first
  result.reverse()

  if (options?.limit) {
    result = result.slice(0, options.limit)
  }

  return result
}

export function getMomentById(id: number) {
  return moments.find(m => m.id === id) || null
}
