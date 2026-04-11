import { requireAuth } from '@/src/middleware-helpers'
import { getMomentById } from '@/src/moments'
import { getTwitchAuth } from '@/src/clip'
import { getVodTimestamp, getVodUrl } from '@/src/firehose'

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || ''

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const moment = await getMomentById(parseInt(id))
  if (!moment) return new Response('Moment not found', { status: 404 })

  const hostname = new URL(request.url).hostname
  const t = moment.clipStart || moment.vodTimestamp || '0h0m0s'

  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>clippy — ${moment.channel} ${moment.mood || moment.vibe}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0a; color: #e0e0e0; font-family: 'SF Mono', monospace; padding: 24px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 14px; font-weight: 500; margin-bottom: 16px; }
    .meta { font-size: 12px; color: #666; margin-bottom: 16px; line-height: 1.8; }
    .meta b { color: #fff; font-weight: 500; }
    .mood { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; }
    .mood.funny { background: #1a1a0a; color: #fbbf24; }
    .mood.hype { background: #0a1a0a; color: #22c55e; }
    .mood.rage { background: #1a0a0a; color: #ef4444; }
    .mood.drama { background: #1a0a1a; color: #e879f9; }
    .mood.shock { background: #1a1a0a; color: #fb923c; }
    .mood.awkward { background: #1a0a1a; color: #c084fc; }
    .mood.clutch { background: #0a1a0a; color: #34d399; }
    .mood.wholesome { background: #0a1a1a; color: #67e8f9; }
    .embed { width: 100%; aspect-ratio: 16/9; border-radius: 6px; overflow: hidden; margin-bottom: 16px; background: #111; }
    .embed iframe { width: 100%; height: 100%; border: none; }
    .desc { font-size: 13px; color: #999; margin-bottom: 16px; line-height: 1.5; }
    .chat { font-size: 11px; color: #444; line-height: 1.6; padding: 12px; background: #111; border-radius: 4px; max-height: 200px; overflow-y: auto; }
    .chat .u { color: #666; }
    a { color: #666; }
    a:hover { color: #fff; }
  </style>
</head><body>
  <h1><a href="/">clippy</a> / ${moment.channel}</h1>
  <div class="meta">
    <span class="mood ${moment.mood || moment.vibe}">${moment.mood || moment.vibe}</span>
    <b>+${moment.jumpPercent}%</b> spike
    &middot; ${moment.timestamp.replace('T', ' ').slice(0, 19)}
    ${moment.vodUrl ? `&middot; <a href="${moment.vodUrl}" target="_blank">open in twitch</a>` : ''}
  </div>
  ${moment.description ? `<div class="desc">${moment.description}</div>` : ''}
  <div class="embed">
    <iframe src="https://player.twitch.tv/?channel=${encodeURIComponent(moment.channel)}&parent=${hostname}&time=${t}&autoplay=true&muted=false" allowfullscreen></iframe>
  </div>
  <div class="chat">
    ${moment.chatSnapshot.map((m: string) => {
      const idx = m.indexOf(': ')
      return idx > -1 ? `<div><span class="u">${m.slice(0, idx)}:</span> ${m.slice(idx + 2)}</div>` : `<div>${m}</div>`
    }).join('')}
  </div>
</body></html>`

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request)
  if (user instanceof Response) return user

  const { id } = await params
  const moment = await getMomentById(parseInt(id))
  if (!moment) return Response.json({ error: 'Moment not found' }, { status: 404 })

  const auth = getTwitchAuth()
  if (!auth.userToken) return Response.json({ error: 'Twitch not connected. Visit /auth/twitch first.' }, { status: 401 })

  const twitchUserToken = auth.userToken
  const twitchUserId = auth.userId

  try {
    const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(moment.channel)}`, {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchUserToken}` },
    })
    const userData = await userRes.json() as any
    const broadcasterId = userData.data?.[0]?.id
    if (!broadcasterId) return Response.json({ error: `Broadcaster "${moment.channel}" not found` }, { status: 404 })

    const title = moment.description
      ? `${moment.channel}: ${moment.description}`.slice(0, 280)
      : `${moment.channel} +${moment.jumpPercent}% ${moment.mood || moment.vibe} moment`

    const videoRes = await fetch(`https://api.twitch.tv/helix/videos?user_id=${broadcasterId}&type=archive&first=1`, {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchUserToken}` },
    })
    const videoData = await videoRes.json() as any
    const vodId = videoData.data?.[0]?.id

    let clipData: any

    if (vodId && moment.vodTimestamp) {
      const ts = moment.vodTimestamp
      const m = ts.match(/(\d+)h(\d+)m(\d+)s/)
      const offsetSeconds = m ? parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) : 0
      const vodOffset = offsetSeconds + 15

      const clipParams = new URLSearchParams({
        broadcaster_id: broadcasterId,
        editor_id: twitchUserId!,
        vod_id: vodId,
        vod_offset: String(vodOffset),
        title,
      })

      console.log(`[clip] Creating VOD clip: ${moment.channel} @ ${vodOffset}s (vod: ${vodId})`)
      const clipRes = await fetch(`https://api.twitch.tv/helix/videos/clips?${clipParams}`, {
        method: 'POST',
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchUserToken}` },
      })
      clipData = await clipRes.json() as any
    }

    // Fallback to live clip
    if (!clipData?.data?.[0]) {
      console.log(`[clip] VOD clip failed, trying live clip for ${moment.channel}`)
      const clipRes = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`, {
        method: 'POST',
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchUserToken}` },
      })
      clipData = await clipRes.json() as any
    }

    if (clipData.data?.[0]) {
      const clip = clipData.data[0]
      console.log(`[clip] Created: ${clip.id}`)
      return Response.json({ clipId: clip.id, clipUrl: `https://clips.twitch.tv/${clip.id}`, editUrl: clip.edit_url, title })
    } else {
      console.error('[clip] Failed:', clipData)
      return Response.json({ error: 'Failed to create clip', detail: clipData }, { status: 500 })
    }
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
