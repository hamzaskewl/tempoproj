import { parseSessionToken, destroySession, clearSessionCookie } from '@/src/auth'
import { isSecure } from '@/src/middleware-helpers'

export async function POST(request: Request) {
  const cookie = request.headers.get('cookie') ?? undefined
  const token = parseSessionToken(cookie)
  if (token) await destroySession(token)
  const secure = isSecure(request)
  return Response.json({ ok: true }, {
    headers: { 'Set-Cookie': clearSessionCookie(secure) },
  })
}
