import { requireAuth } from '@/src/middleware-helpers'
import { setActiveChannel, removeActiveChannel } from '@/src/firehose'

export async function POST(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const user = await requireAuth(request)
  if (user instanceof Response) return user
  const { channel } = await params
  const ch = channel.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  if (!ch) return Response.json({ error: 'Invalid channel name' }, { status: 400 })
  setActiveChannel(ch)
  return Response.json({ tracking: ch })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const user = await requireAuth(request)
  if (user instanceof Response) return user
  const { channel } = await params
  const ch = channel.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  removeActiveChannel(ch)
  return Response.json({ removed: ch })
}
