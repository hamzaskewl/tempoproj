import { parseSessionToken, validateSession, checkRateLimit } from './auth/index.js'
import type { User } from './auth/index.js'

export async function getAuthUser(request: Request): Promise<User | null> {
  const cookie = request.headers.get('cookie') ?? undefined
  const token = parseSessionToken(cookie)
  if (!token) return null
  return validateSession(token)
}

export async function requireAuth(request: Request): Promise<User | Response> {
  const cookie = request.headers.get('cookie') ?? undefined
  const token = parseSessionToken(cookie)
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 })
  const user = await validateSession(token)
  if (!user) return Response.json({ error: 'Session expired' }, { status: 401 })
  return user
}

export async function requireAdmin(request: Request): Promise<User | Response> {
  const result = await requireAuth(request)
  if (result instanceof Response) return result
  if (result.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 })
  return result
}

export function rateLimit(request: Request): Response | null {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
  if (!checkRateLimit(ip)) {
    return Response.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 })
  }
  return null
}

export function isSecure(request: Request): boolean {
  return request.headers.get('x-forwarded-proto') === 'https'
    || new URL(request.url).protocol === 'https:'
}
