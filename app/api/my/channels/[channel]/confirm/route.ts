import { requireAuth } from '@/src/middleware-helpers'
import { confirmUserChannel, getUserChannels } from '@/src/moments'

export async function POST(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  const user = await requireAuth(request)
  if (user instanceof Response) return user
  const { channel } = await params
  const ch = channel.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  const result = await confirmUserChannel(user.id, ch)
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 })
  const channels = await getUserChannels(user.id)
  return Response.json({ channels, maxChannels: 3 })
}
