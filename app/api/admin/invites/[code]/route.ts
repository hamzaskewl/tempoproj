import { requireAdmin } from '@/src/middleware-helpers'
import { deleteInviteCode } from '@/src/auth'

export async function DELETE(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await requireAdmin(request)
  if (user instanceof Response) return user
  const { code } = await params
  await deleteInviteCode(code)
  return Response.json({ ok: true })
}
