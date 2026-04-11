import { getMoments } from '@/src/moments'

export async function GET(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params
  const result = await getMoments({ channel, limit: 1 })
  if (result.length === 0) return Response.json({ error: 'No moments for this channel' }, { status: 404 })
  return Response.json(result[0])
}
