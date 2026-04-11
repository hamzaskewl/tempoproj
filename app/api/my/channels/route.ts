import { requireAuth } from '@/src/middleware-helpers'
import { getUserChannels, addUserChannel } from '@/src/moments'

export async function GET(request: Request) {
  const user = await requireAuth(request)
  if (user instanceof Response) return user
  const channels = await getUserChannels(user.id)
  return Response.json({ channels, maxChannels: 3 })
}

export async function POST(request: Request) {
  const user = await requireAuth(request)
  if (user instanceof Response) return user
  const { channel } = await request.json().catch(() => ({}))
  if (!channel) return Response.json({ error: 'Missing channel name' }, { status: 400 })
  const ch = channel.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  if (!ch) return Response.json({ error: 'Invalid channel name' }, { status: 400 })
  const result = await addUserChannel(user.id, ch)
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 })
  return Response.json({ channels: result.channels, maxChannels: 3 })
}
