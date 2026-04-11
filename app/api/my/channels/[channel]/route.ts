import { requireAuth } from '@/src/middleware-helpers'
import { removeUserChannel } from '@/src/moments'

export async function DELETE(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const user = await requireAuth(request)
  if (user instanceof Response) return user
  const { channel } = await params
  const ch = channel.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  const result = await removeUserChannel(user.id, ch)
  return Response.json({ channels: result.channels, maxChannels: 3 })
}
