import { summarizeChannel } from '@/src/summarize'

export async function POST(request: Request) {
  const { channel } = await request.json().catch(() => ({}))
  if (!channel) return Response.json({ error: 'Missing "channel" in request body' }, { status: 400 })
  try {
    const result = await summarizeChannel(channel)
    return Response.json({ channel, ...result })
  } catch (err: any) {
    console.error('[summarize] Error:', err)
    return Response.json({ error: 'Failed to summarize channel', detail: err.message }, { status: 500 })
  }
}
