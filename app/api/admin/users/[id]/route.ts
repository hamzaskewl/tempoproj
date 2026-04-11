import { requireAdmin } from '@/src/middleware-helpers'
import { deleteUser } from '@/src/auth'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin(request)
  if (user instanceof Response) return user
  const { id } = await params
  if (id === user.id) return Response.json({ error: "Can't delete yourself" }, { status: 400 })
  await deleteUser(id)
  return Response.json({ ok: true })
}
