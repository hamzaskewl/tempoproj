import { getChannel } from '@/src/firehose'

export async function POST(request: Request) {
  const { channel } = await request.json().catch(() => ({}))
  if (!channel) return Response.json({ error: 'Missing "channel" in request body' }, { status: 400 })
  const result = getChannel(channel)
  if (!result) return Response.json({ error: `Channel "${channel}" not found or no recent activity` }, { status: 404 })
  return Response.json(result)
}
