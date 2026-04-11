import { NextResponse } from 'next/server'
import { rateLimit } from '@/src/middleware-helpers'

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || ''
const BASE_URL = process.env.BASE_URL || ''

export async function GET(request: Request) {
  const limited = rateLimit(request)
  if (limited) return limited

  const url = new URL(request.url)
  const inviteCode = url.searchParams.get('code') || url.searchParams.get('invite') || ''
  const state = inviteCode ? Buffer.from(JSON.stringify({ invite: inviteCode })).toString('base64url') : ''

  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')
  const host = request.headers.get('host') || url.host
  const fallback = `${proto}://${host}`
  const redirect = `${BASE_URL || fallback}/api/auth/twitch/callback`

  const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=clips:edit+editor:manage:clips${state ? `&state=${state}` : ''}`
  return NextResponse.redirect(authUrl)
}
