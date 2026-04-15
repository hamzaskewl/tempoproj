import { NextResponse } from 'next/server'
import { rateLimit } from '@/src/middleware-helpers'

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || ''

// BASE_URL forces the OAuth redirect_uri to a fixed origin. Set this in
// production (e.g. https://clippy.build) so the callback always matches
// the URI registered in the Twitch Developer Console. Leave it UNSET in
// local dev so the redirect_uri is derived from the incoming request
// (http://localhost:3000) — otherwise Twitch will bounce the user back
// to the production origin after authorizing.
const BASE_URL = process.env.BASE_URL || ''

export async function GET(request: Request) {
  const limited = rateLimit(request)
  if (limited) return limited

  const url = new URL(request.url)
  const inviteCode = url.searchParams.get('code') || url.searchParams.get('invite') || ''
  const state = inviteCode ? Buffer.from(JSON.stringify({ invite: inviteCode })).toString('base64url') : ''

  let origin: string
  if (BASE_URL) {
    origin = BASE_URL.replace(/\/$/, '')
  } else {
    const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')
    const host = request.headers.get('host') || url.host
    origin = `${proto}://${host}`
  }
  const redirect = `${origin}/api/auth/twitch/callback`

  console.log(`[auth] Twitch OAuth init — redirect_uri=${redirect}`)

  const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent('clips:edit')}${state ? `&state=${state}` : ''}`
  return NextResponse.redirect(authUrl)
}
