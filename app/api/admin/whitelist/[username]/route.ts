import { requireAdmin } from '@/src/middleware-helpers'
import { removeFromWhitelist, getWhitelist } from '@/src/auth'

export async function DELETE(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const user = await requireAdmin(request)
  if (user instanceof Response) return user
  const { username } = await params
  await removeFromWhitelist(username.toLowerCase())
  return Response.json({ ok: true, whitelist: await getWhitelist() })
}
