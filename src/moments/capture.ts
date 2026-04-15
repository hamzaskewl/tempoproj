import { onSpike, getVodTimestamp, getVodUrl } from '../firehose/index'
import { classifySpike } from '../summarize/index'
import { createClip, hasTwitchAuth } from '../clip/index'
import { memMoments, bumpMemId, saveMoment } from './queries'
import { watchedChannelsSet, getUsersForChannel } from './channels'
import type { Moment } from './queries'

// Auto-capture moments when spikes happen
export function startMomentCapture() {
  console.log('[moments] Auto-capture enabled — storing moments on spike detection')

  const minConfidence = parseFloat(process.env.SPIKE_MIN_CONFIDENCE || '0.3')

  onSpike(async (spike) => {
    // v1 path: legacy jumpPercent gate
    // v2 path: confidence-based gate (z-score driven)
    if (spike.detector === 'v2') {
      if (typeof spike.confidence === 'number' && spike.confidence < minConfidence) return
    } else {
      if (spike.jumpPercent < 40) return
    }

    const memId = bumpMemId()
    // v2 freezes chatSnapshot on the spike event at peak time; v1 sets it at trigger.
    // Either way, prefer whatever the detector attached so classification sees the climax.
    const chatSnapshot: string[] = Array.isArray(spike.chatSnapshot) ? spike.chatSnapshot : []
    const isWatched = watchedChannelsSet.has(spike.channel.toLowerCase())
    const captureAt = typeof spike.peakAt === 'number' ? spike.peakAt : spike.spikeAt

    const ownerUsers = getUsersForChannel(spike.channel.toLowerCase())
    const primaryUserId = ownerUsers.length > 0 ? ownerUsers[0] : null

    const moment: Moment = {
      id: memId, channel: spike.channel, userId: primaryUserId,
      timestamp: new Date(spike.spikeAt).toISOString(), spikeAt: spike.spikeAt,
      clipStart: null, clipEnd: null, clipStartUrl: null, clipEndUrl: null,
      vodTimestamp: null, vodUrl: null,
      jumpPercent: spike.jumpPercent, burst: spike.burst, baseline: spike.baseline,
      mood: null, description: null,
      vibe: spike.vibe, vibeIntensity: spike.vibeIntensity,
      clipWorthy: false, clipUrl: null, clipId: null,
      chatSnapshot,
    }

    memMoments.push(moment)
    const peakBurst = typeof spike.peakBurst === 'number' ? spike.peakBurst : spike.burst
    const durationMs = typeof spike.durationMs === 'number' ? spike.durationMs : 0
    console.log(`[moments] #${memId} captured: ${spike.channel} +${spike.jumpPercent}% (${spike.vibe}) peak=${peakBurst}msg/s dur=${Math.round(durationMs / 1000)}s det=${spike.detector}`)

    // For watched channels: classify with LLM + auto-clip
    if (isWatched) {
      try {
        const context = {
          streamer: spike.channel,
          game: (spike as any).game || null,
          streamTitle: (spike as any).streamTitle || null,
          viewers: spike.viewers || null,
        }
        const result = await classifySpike(chatSnapshot, context)
        if (result) {
          moment.mood = result.mood
          moment.description = result.description
          moment.clipWorthy = result.clipWorthy
          console.log(`[moments] #${memId} LLM: ${result.mood} / clipWorthy=${result.clipWorthy} — "${result.description}"`)

          // Notify prediction market — signed attestation locks + resolves any matching open market
          try {
            const oracle = await import('../oracle/index')
            await oracle.reportMoodFired({
              channel: spike.channel,
              mood: result.mood,
              spikeAt: spike.spikeAt,
            })
          } catch (err: any) {
            console.error(`[moments] #${memId} oracle report failed:`, err?.message || err)
          }

          if (result.clipWorthy && hasTwitchAuth()) {
            const clip = await createClip(spike.channel, primaryUserId || undefined)
            if (clip) {
              moment.clipUrl = clip.clipUrl
              moment.clipId = clip.clipId
              console.log(`[moments] #${memId} clipped: ${clip.clipUrl}`)
            }
          } else if (!result.clipWorthy) {
            console.log(`[moments] #${memId} skipped clipping — not clip-worthy`)
          }
        }
      } catch (err: any) {
        console.error(`[moments] #${memId} classify failed:`, err.message)
      }
    }

    // Enrich with VOD timestamps — anchor to the peak, not the onset,
    // so the clip window centers on the loudest point of the spike.
    try {
      const vodTimestamp = await getVodTimestamp(spike.channel, captureAt)
      if (vodTimestamp) {
        moment.vodTimestamp = vodTimestamp
        moment.vodUrl = await getVodUrl(spike.channel, vodTimestamp)
        const startVod = await getVodTimestamp(spike.channel, captureAt - 10_000)
        const endVod = await getVodTimestamp(spike.channel, captureAt + 30_000)
        moment.clipStart = startVod
        moment.clipEnd = endVod
        moment.clipStartUrl = startVod ? await getVodUrl(spike.channel, startVod) : null
        moment.clipEndUrl = endVod ? await getVodUrl(spike.channel, endVod) : null
      }
    } catch {}

    // Save to DB
    try {
      const dbId = await saveMoment(moment)
      moment.id = dbId
    } catch (err: any) {
      console.error(`[moments] DB save failed:`, err.message)
    }

    // Keep max 500 in memory cache
    if (memMoments.length > 500) memMoments.shift()
  })
}
