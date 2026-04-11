import { NextResponse } from 'next/server'
import { rateLimit, isSecure } from '@/src/middleware-helpers'
import { createUser, getUser, createSession, getSessionCookie, validateInviteCode, redeemInviteCode, isDesignatedAdmin, isWhitelisted, createPendingRegistration, consumePendingRegistration } from '@/src/auth'
import { setTwitchAuth } from '@/src/clip'

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || ''
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || ''
const BASE_URL = process.env.BASE_URL || ''

export async function GET(request: Request) {
  const limited = rateLimit(request)
  if (limited) return limited

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (!code) return new Response('Missing code', { status: 400 })

  let inviteFromUrl = ''
  const stateParam = url.searchParams.get('state')
  if (stateParam) {
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
      inviteFromUrl = decoded.invite || ''
    } catch {}
  }

  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')
  const host = request.headers.get('host') || url.host
  const origin = `${proto}://${host}`
  const redirect = `${origin}/api/auth/twitch/callback`
  const secure = isSecure(request)

  try {
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirect,
      }),
    })
    const data = await tokenRes.json() as any
    if (!data.access_token) {
      console.error('[auth] Twitch OAuth failed:', data)
      return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url))
    }

    const meRes = await fetch('https://api.twitch.tv/helix/users', {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${data.access_token}` },
    })
    const meData = await meRes.json() as any
    const twitchUser = meData.data?.[0]
    if (!twitchUser) return NextResponse.redirect(new URL('/login?error=user_fetch_failed', request.url))

    const twitchId = twitchUser.id
    const username = twitchUser.display_name || twitchUser.login
    const profileImage = twitchUser.profile_image_url || ''

    setTwitchAuth(data.access_token, twitchId, data.refresh_token)

    // 1. Existing user — log them in
    let user = await getUser(twitchId)
    if (user) {
      const session = await createSession(user.id)
      const response = NextResponse.redirect(new URL('/dashboard', request.url))
      response.headers.set('Set-Cookie', getSessionCookie(session.token, secure))
      console.log(`[auth] Login: ${username} (${twitchId}) role=${user.role}`)
      return response
    }

    // 2. Designated admin — create + log in, no invite needed
    if (isDesignatedAdmin(username)) {
      user = await createUser(twitchId, username, profileImage, 'admin_env', true)
      const session = await createSession(user.id)
      const response = NextResponse.redirect(new URL('/dashboard', request.url))
      response.headers.set('Set-Cookie', getSessionCookie(session.token, secure))
      console.log(`[auth] Admin login: ${username} (${twitchId})`)
      return response
    }

    // 3. Whitelisted user — create + log in, no invite needed
    if (isWhitelisted(username)) {
      user = await createUser(twitchId, username, profileImage, 'whitelist', true)
      const session = await createSession(user.id)
      const response = NextResponse.redirect(new URL('/dashboard', request.url))
      response.headers.set('Set-Cookie', getSessionCookie(session.token, secure))
      console.log(`[auth] Whitelisted user registered: ${username} (${twitchId})`)
      return response
    }

    // 4. New user — if invite code from URL, try to auto-apply
    if (inviteFromUrl) {
      const valid = await validateInviteCode(inviteFromUrl)
      if (valid) {
        await redeemInviteCode(inviteFromUrl, twitchId, username)
        user = await createUser(twitchId, username, profileImage, inviteFromUrl, true)
        const session = await createSession(user.id)
        const response = NextResponse.redirect(new URL('/dashboard', request.url))
        response.headers.set('Set-Cookie', getSessionCookie(session.token, secure))
        console.log(`[auth] New user auto-registered: ${username} (${twitchId}) with invite from URL: ${inviteFromUrl}`)
        return response
      }
    }

    // 5. New user, no valid invite from URL — send to invite code page
    const pending = createPendingRegistration(twitchId, username, profileImage, data.access_token)
    const avatarParam = profileImage ? `&avatar=${encodeURIComponent(profileImage)}` : ''
    const inviteParam = inviteFromUrl ? `&prefill=${encodeURIComponent(inviteFromUrl)}` : ''
    console.log(`[auth] New user ${username} — redirecting to invite code page`)
    return NextResponse.redirect(new URL(`/invite?token=${pending.token}&name=${encodeURIComponent(username)}${avatarParam}${inviteParam}`, request.url))
  } catch (err: any) {
    console.error('[auth] OAuth error:', err.message)
    return NextResponse.redirect(new URL('/login?error=server_error', request.url))
  }
}
