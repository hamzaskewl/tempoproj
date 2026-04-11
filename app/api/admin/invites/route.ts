import { requireAdmin } from '@/src/middleware-helpers'
import { getInviteCodes } from '@/src/auth'

export async function GET(request: Request) {
  const user = await requireAdmin(request)
  if (user instanceof Response) return user
  return Response.json({ invites: await getInviteCodes() })
}
