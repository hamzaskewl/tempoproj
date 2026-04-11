import { requireAuth } from '@/src/middleware-helpers'
import { getChannel, getViewerCount, isStreamLive } from '@/src/firehose'

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const user = await requireAuth(request)
  if (user instanceof Response) return user
  const { name } = await params
  const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  const data = getChannel(sanitized)
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 })
  const viewers = await getViewerCount(sanitized).catch(() => null)
  const live = await isStreamLive(sanitized).catch(() => false)
  return Response.json({
    channel: data.channel,
    rate: data.sustained,
    burst: data.burst,
    baseline: data.baseline,
    jumpPercent: data.jumpPercent,
    isSpike: data.isSpike,
    vibe: data.vibe,
    viewers,
    live,
  })
}
