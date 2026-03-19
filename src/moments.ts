import { onSpike, getRecentMessages, getVodTimestamp } from './firehose.js'
import { classifySpike } from './summarize.js'

export interface Moment {
  id: number
  channel: string
  timestamp: string
  spikeAt: number
  clipStart: string | null
  clipEnd: string | null
  clipStartUrl: string | null
  clipEndUrl: string | null
  vodTimestamp: string | null
  vodUrl: string | null
  jumpPercent: number
  burst: number
  baseline: number
  // LLM-classified mood + description
  mood: string | null
  description: string | null
  // Legacy vibe (regex-based, kept as fallback)
  vibe: string
  vibeIntensity: number
  clipWorthy: boolean
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
      burst: spike.burst,
      baseline: spike.baseline,
      mood: null,
      description: null,
      vibe: spike.vibe,
      vibeIntensity: spike.vibeIntensity,
      clipWorthy,
      chatSnapshot,
    }

    moments.push(moment)
    console.log(`[moments] #${id} captured: ${spike.channel} +${spike.jumpPercent}% (${spike.vibe})${clipWorthy ? ' [CLIP-WORTHY]' : ''}`)

    // Enrich async — VOD timestamp + clip range
    try {
      const vodTimestamp = await getVodTimestamp(spike.channel, spike.spikeAt)
      if (vodTimestamp) {
        moment.vodTimestamp = vodTimestamp
        moment.vodUrl = `https://twitch.tv/${spike.channel}?t=${vodTimestamp}`

        const startVod = await getVodTimestamp(spike.channel, spike.spikeAt - 10_000)
        const endVod = await getVodTimestamp(spike.channel, spike.spikeAt + 30_000)

        moment.clipStart = startVod
        moment.clipEnd = endVod
        moment.clipStartUrl = startVod ? `https://twitch.tv/${spike.channel}?t=${startVod}` : null
        moment.clipEndUrl = endVod ? `https://twitch.tv/${spike.channel}?t=${endVod}` : null
      }
    } catch {}

    // LLM mood classification — only runs on demand (via session subscriber or API call)
    // to avoid draining USDC on every spike

    // Keep max 1000 moments in memory
    if (moments.length > 1000) {
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
