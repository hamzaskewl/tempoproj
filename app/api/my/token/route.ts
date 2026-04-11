import { requireAuth } from '@/src/middleware-helpers'
import { revokeTwitchAuth } from '@/src/clip'

export async function DELETE(request: Request) {
  const user = await requireAuth(request)
  if (user instanceof Response) return user
  try {
    await revokeTwitchAuth(user.id)
    return Response.json({ ok: true })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
