import { onSpike, getVodTimestamp, getVodUrl, isStreamLive } from '@/src/firehose'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const filterChannel = url.searchParams.get('channel')?.toLowerCase()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      send({ type: 'connected', message: 'Listening for spikes...' })

      const unsubscribe = onSpike(async (spike) => {
        if (filterChannel && spike.channel.toLowerCase() !== filterChannel) return
        const vodTimestamp = await getVodTimestamp(spike.channel, spike.spikeAt)
        send({
          type: 'spike',
          ...spike,
          vodTimestamp,
          vodUrl: vodTimestamp ? await getVodUrl(spike.channel, vodTimestamp) : null,
          timestamp: new Date(spike.spikeAt).toISOString(),
        })
      })

      let offlineStreak = 0
      const heartbeat = setInterval(async () => {
        try {
          send({ type: 'heartbeat' })
          if (filterChannel) {
            const live = await isStreamLive(filterChannel)
            if (!live) {
              offlineStreak++
              if (offlineStreak >= 2) {
                send({ type: 'stream_ended', channel: filterChannel, message: 'Stream went offline.' })
                controller.close()
                return
              }
            } else {
              offlineStreak = 0
            }
          }
        } catch {}
      }, 60_000)

      request.signal.addEventListener('abort', () => {
        unsubscribe()
        clearInterval(heartbeat)
        console.log('[alerts] Client disconnected')
      })

      console.log(`[alerts] Client connected${filterChannel ? ` (filter: ${filterChannel})` : ''}`)
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
