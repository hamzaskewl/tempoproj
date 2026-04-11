import { mppx } from '@/src/mpp'
import { onSpike, getVodTimestamp, getVodUrl, isStreamLive, getViewerCount } from '@/src/firehose'
import { classifySpike } from '@/src/summarize'

export const dynamic = 'force-dynamic'

export const POST = mppx.session({ amount: '0.03', unitType: 'spike', description: 'Watch channel for AI-classified spikes + auto-clipping' })(
  async (request: Request) => {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const channel = pathParts[pathParts.length - 1].toLowerCase()
    const viewers = await getViewerCount(channel)
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      start(controller) {
        const send = (data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch {}
        }

        send({ type: 'watching', channel, viewers })

        const unsubscribe = onSpike(async (spike) => {
          if (spike.channel.toLowerCase() !== channel) return

          const chatSnapshot = spike.chatSnapshot || []
          const classification = await classifySpike(chatSnapshot).catch(() => null)
          const vodTimestamp = await getVodTimestamp(spike.channel, spike.spikeAt).catch(() => null)

          send({
            type: 'spike',
            channel: spike.channel,
            viewers: spike.viewers,
            burst: spike.burst,
            baseline: spike.baseline,
            jumpPercent: spike.jumpPercent,
            mood: classification?.mood || spike.vibe,
            description: classification?.description || null,
            clipWorthy: classification?.clipWorthy || false,
            vodTimestamp,
            vodUrl: vodTimestamp ? await getVodUrl(spike.channel, vodTimestamp) : null,
            timestamp: new Date(spike.spikeAt).toISOString(),
          })
        })

        let offlineStreak = 0
        const heartbeat = setInterval(async () => {
          try {
            send({ type: 'heartbeat' })
            const live = await isStreamLive(channel)
            if (!live) {
              offlineStreak++
              if (offlineStreak >= 2) {
                send({ type: 'stream_ended', channel, message: 'Stream went offline. Session closed, unused deposit refunded.' })
                controller.close()
                return
              }
            } else {
              offlineStreak = 0
            }
          } catch {}
        }, 60_000)

        request.signal.addEventListener('abort', () => {
          unsubscribe()
          clearInterval(heartbeat)
          console.log(`[watch] ${channel} — client disconnected`)
        })

        console.log(`[watch] ${channel} — session started (${viewers ? viewers + ' viewers' : 'unknown'})`)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }
)
