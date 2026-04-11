import { requireAdmin } from '@/src/middleware-helpers'
import { getWhitelist, addToWhitelist } from '@/src/auth'

export async function GET(request: Request) {
  const user = await requireAdmin(request)
  if (user instanceof Response) return user
  return Response.json({ whitelist: await getWhitelist() })
}

export async function POST(request: Request) {
  const user = await requireAdmin(request)
  if (user instanceof Response) return user
  const { username } = await request.json().catch(() => ({}))
  if (!username) return Response.json({ error: 'Missing username' }, { status: 400 })
  const u = username.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  if (!u) return Response.json({ error: 'Invalid username' }, { status: 400 })
  await addToWhitelist(u, user.id)
  return Response.json({ ok: true, whitelist: await getWhitelist() })
}
