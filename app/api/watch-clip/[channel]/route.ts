import { requireAuth } from '@/src/middleware-helpers'
import { watchChannel, unwatchChannel, getWatchedChannels } from '@/src/moments'

export async function POST(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const user = await requireAuth(request)
  if (user instanceof Response) return user
  const { channel } = await params
  const ch = channel.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  if (!ch) return Response.json({ error: 'Invalid channel name' }, { status: 400 })
  await watchChannel(ch)
  return Response.json({ watching: getWatchedChannels() })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const user = await requireAuth(request)
  if (user instanceof Response) return user
  const { channel } = await params
  const ch = channel.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  await unwatchChannel(ch)
  return Response.json({ watching: getWatchedChannels() })
}
