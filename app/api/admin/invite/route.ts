import { requireAdmin } from '@/src/middleware-helpers'
import { generateInviteCode } from '@/src/auth'

export async function POST(request: Request) {
  const user = await requireAdmin(request)
  if (user instanceof Response) return user
  const { label, maxUses } = await request.json().catch(() => ({}))
  const uses = Math.min(Math.max(parseInt(maxUses) || 1, 1), 10000)
  const invite = await generateInviteCode(user.id, label || '', uses)
  return Response.json({ code: invite.code, label: invite.label, maxUses: invite.maxUses })
}
