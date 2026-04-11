import { NextResponse } from 'next/server'
import { rateLimit, isSecure } from '@/src/middleware-helpers'
import { validateInviteCode, redeemInviteCode, createUser, createSession, getSessionCookie, createPendingRegistration, consumePendingRegistration } from '@/src/auth'

export async function GET(request: Request) {
  const limited = rateLimit(request)
  if (limited) return limited

  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  const inviteCode = url.searchParams.get('invite')

  if (!token || !inviteCode) return NextResponse.redirect(new URL('/login', request.url))

  const pending = consumePendingRegistration(token)
  if (!pending) return NextResponse.redirect(new URL('/login?error=server_error', request.url))

  if (!(await validateInviteCode(inviteCode))) {
    const newPending = createPendingRegistration(pending.twitchId, pending.username, pending.profileImage, pending.twitchAccessToken)
    const avatarParam = pending.profileImage ? `&avatar=${encodeURIComponent(pending.profileImage)}` : ''
    return NextResponse.redirect(new URL(`/invite?token=${newPending.token}&name=${encodeURIComponent(pending.username)}${avatarParam}&error=invalid_invite`, request.url))
  }

  await redeemInviteCode(inviteCode, pending.twitchId, pending.username)
  const user = await createUser(pending.twitchId, pending.username, pending.profileImage, inviteCode, true)

  const secure = isSecure(request)
  const session = await createSession(user.id)
  const response = NextResponse.redirect(new URL('/dashboard', request.url))
  response.headers.set('Set-Cookie', getSessionCookie(session.token, secure))

  console.log(`[auth] New user registered: ${pending.username} (${pending.twitchId}) with invite ${inviteCode}`)
  return response
}
