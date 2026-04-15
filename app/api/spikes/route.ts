import { getSpikes, getVodTimestamp, getVodUrl } from '@/src/firehose'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const withinMinutes = body?.withinMinutes || 5
  const spikes = getSpikes(withinMinutes)
  const enriched = await Promise.all(
    spikes.map(async (spike: any) => {
      const vodTimestamp = spike.spikeAt ? await getVodTimestamp(spike.channel, spike.spikeAt) : null
      return {
        ...spike,
        vodTimestamp,
        vodUrl: vodTimestamp ? await getVodUrl(spike.channel, vodTimestamp) : null,
      }
    })
  )
  return Response.json({ spikes: enriched, count: enriched.length })
}
