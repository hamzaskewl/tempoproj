import { requireAuth } from '@/src/middleware-helpers'
import { getWatchedChannels } from '@/src/moments'

export async function GET(request: Request) {
  const user = await requireAuth(request)
  if (user instanceof Response) return user
  return Response.json({ watching: getWatchedChannels() })
}
