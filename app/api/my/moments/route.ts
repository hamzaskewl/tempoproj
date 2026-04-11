import { requireAuth } from '@/src/middleware-helpers'
import { getMomentsByUser, getUserChannels } from '@/src/moments'

export async function GET(request: Request) {
  const user = await requireAuth(request)
  if (user instanceof Response) return user
  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const moments = await getMomentsByUser(user.id, limit)
  const channels = await getUserChannels(user.id)
  return Response.json({ moments, channels: channels.map((c: any) => c.channel) })
}
