import { requireAdmin } from '@/src/middleware-helpers'
import { revokeTwitchAuth } from '@/src/clip'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin(request)
  if (user instanceof Response) return user
  try {
    const { id } = await params
    await revokeTwitchAuth(id)
    return Response.json({ ok: true })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
