import { webcrypto } from 'node:crypto'
if (!globalThis.crypto) (globalThis as any).crypto = webcrypto
import 'dotenv/config'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { Mppx, tempo } from 'mppx/express'
import { createClient, http } from 'viem'
import { tempo as tempoChain } from 'viem/chains'
import { connectFirehose, getTrending, getChannel, getSpikes, getStats, isConnected, getVodTimestamp, onSpike, getViewerCount } from './firehose.js'
import { summarizeChannel, classifySpike } from './summarize.js'
import { startMomentCapture, getMoments, getMomentById, watchChannel, unwatchChannel, getWatchedChannels } from './moments.js'
import { setTwitchAuth, getTwitchAuth, createClip } from './clip.js'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'public')))

const PORT = process.env.PORT || 3000
const WALLET = process.env.WALLET_ADDRESS || '0xfaad4f22fc6259646c8925203a04020e5458da6d'

// USDC on Tempo mainnet
const USDC = '0x20c000000000000000000000b9537d11c60e8b50'

// Viem client for verifying on-chain payments
const client = createClient({
  chain: tempoChain,
  transport: http(process.env.TEMPO_RPC || 'https://rpc.tempo.xyz'),
})

// Secret key for HMAC-binding challenges (stateless verification)
const secretKey = process.env.PAYMENT_SECRET || crypto.randomBytes(32).toString('hex')

// Create mppx payment handler (charge for one-off queries, session for streaming)
const mppx = Mppx.create({
  methods: [
    tempo({
      currency: USDC,
      recipient: WALLET as `0x${string}`,
      getClient: () => client,
      sse: true,
    }),
  ],
  secretKey,
  realm: 'clippy.live',
})

// --- Health / Status (free) ---
app.get('/api', (_req, res) => {
  const stats = getStats()
  res.json({
    service: 'Clippy API',
    description: 'Real-time Twitch stream intelligence. Pay per query via MPP.',
    version: '1.0.0',
    status: stats.connected ? 'live' : 'connecting',
    ...stats,
    endpoints: {
      'GET /': { price: 'free', description: 'Service info and status' },
      'GET /health': { price: 'free', description: 'Health check' },
      'POST /trending': { price: '$0.001', description: 'Top channels by chat velocity' },
      'POST /channel': { price: '$0.001', description: 'Chat stats for a specific channel' },
      'POST /spikes': { price: '$0.002', description: 'Channels with recent chat spikes' },
      'POST /summarize': { price: '$0.01', description: 'LLM-powered summary of chat discussion' },
      'GET /alerts': { price: 'free', description: 'SSE stream of real-time spike alerts. Query: ?channel=name' },
      'POST /moments': { price: '$0.001', description: 'All auto-captured moments with VOD links and LLM summaries' },
      'GET /moments/:id': { price: 'free', description: 'Get a specific moment by ID' },
      'POST /watch/:channel': { price: '$0.001/spike (session)', description: 'SSE stream with LLM-classified spikes for a channel' },
    },
  })
})

app.get('/health', (_req, res) => {
  res.json({ ok: true, connected: isConnected(), ...getStats() })
})

// --- Twitch OAuth for clip creation ---
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || ''
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || ''
let twitchUserToken: string | null = null
let twitchUserId: string | null = null

app.get('/auth/twitch', (req, res) => {
  const proto = req.get('x-forwarded-proto') || req.protocol
  const redirect = `${proto}://${req.get('host')}/auth/twitch/callback`
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=clips:edit+editor:manage:clips`
  res.redirect(url)
})

app.get('/auth/twitch/callback', async (req, res) => {
  const code = req.query.code as string
  if (!code) return res.status(400).send('Missing code')

  const proto = req.get('x-forwarded-proto') || req.protocol
  const redirect = `${proto}://${req.get('host')}/auth/twitch/callback`
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
  if (data.access_token) {
    twitchUserToken = data.access_token
    // Get user ID
    const meRes = await fetch('https://api.twitch.tv/helix/users', {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchUserToken}` },
    })
    const meData = await meRes.json() as any
    twitchUserId = meData.data?.[0]?.id || null
    setTwitchAuth(twitchUserToken, twitchUserId || '')
    console.log(`[twitch] OAuth token acquired (user: ${twitchUserId}) — auto-clipping enabled`)
    res.send('<h3>Twitch connected!</h3><p>You can close this tab. Clips are now enabled.</p><script>setTimeout(()=>window.close(),2000)</script>')
  } else {
    console.error('[twitch] OAuth failed:', data)
    res.status(500).send('OAuth failed: ' + JSON.stringify(data))
  }
})

// Create a clip for a moment
app.post('/clip/:id', async (req, res) => {
  const moment = getMomentById(parseInt(req.params.id))
  if (!moment) return res.status(404).json({ error: 'Moment not found' })
  if (!twitchUserToken) return res.status(401).json({ error: 'Twitch not connected. Visit /auth/twitch first.' })

  try {
    // Get broadcaster ID
    const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${moment.channel}`, {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchUserToken}` },
    })
    const userData = await userRes.json() as any
    const broadcasterId = userData.data?.[0]?.id
    if (!broadcasterId) return res.status(404).json({ error: `Broadcaster "${moment.channel}" not found` })

    // Build title from mood/description
    const title = moment.description
      ? `${moment.channel}: ${moment.description}`.slice(0, 280)
      : `${moment.channel} +${moment.jumpPercent}% ${moment.mood || moment.vibe} moment`

    // Get current VOD for the stream
    const videoRes = await fetch(`https://api.twitch.tv/helix/videos?user_id=${broadcasterId}&type=archive&first=1`, {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchUserToken}` },
    })
    const videoData = await videoRes.json() as any
    const vodId = videoData.data?.[0]?.id

    let clipData: any

    if (vodId && moment.vodTimestamp) {
      // Parse vodTimestamp to seconds for vod_offset (clip ends here)
      const ts = moment.vodTimestamp
      const m = ts.match(/(\d+)h(\d+)m(\d+)s/)
      const offsetSeconds = m ? parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) : 0
      // Clip ends 15s after spike, starts 15s before (30s default duration)
      const vodOffset = offsetSeconds + 15

      const params = new URLSearchParams({
        broadcaster_id: broadcasterId,
        editor_id: twitchUserId!,
        vod_id: vodId,
        vod_offset: String(vodOffset),
        title,
      })

      console.log(`[clip] Creating VOD clip: ${moment.channel} @ ${vodOffset}s (vod: ${vodId})`)
      const clipRes = await fetch(`https://api.twitch.tv/helix/videos/clips?${params}`, {
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
      res.json({ clipId: clip.id, clipUrl: `https://clips.twitch.tv/${clip.id}`, editUrl: clip.edit_url, title })
    } else {
      console.error('[clip] Failed:', clipData)
      res.status(500).json({ error: 'Failed to create clip', detail: clipData })
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// --- Watchlist (controls which channels get auto-clipped) ---
app.post('/watch-clip/:channel', (req, res) => {
  watchChannel(req.params.channel)
  res.json({ watching: getWatchedChannels() })
})

app.delete('/watch-clip/:channel', (req, res) => {
  unwatchChannel(req.params.channel)
  res.json({ watching: getWatchedChannels() })
})

app.get('/watch-clip', (_req, res) => {
  res.json({ watching: getWatchedChannels() })
})

// --- Trending (free for dashboard, top 10 only) ---
app.get('/trending', (_req, res) => {
  res.json(getTrending(10))
})

// --- Trending (paid, full) ---
app.post('/trending',
  mppx.charge({ amount: '0.001', description: 'Trending channels query' }),
  (req, res) => {
    const limit = req.body?.limit || 20
    const result = getTrending(limit)
    res.json(result)
  }
)

// --- Channel (paid) ---
app.post('/channel',
  mppx.charge({ amount: '0.001', description: 'Channel stats query' }),
  (req, res) => {
    const { channel } = req.body || {}
    if (!channel) {
      return res.status(400).json({ error: 'Missing "channel" in request body' })
    }
    const result = getChannel(channel)
    if (!result) {
      return res.status(404).json({ error: `Channel "${channel}" not found or no recent activity` })
    }
    res.json(result)
  }
)

// --- Spikes (paid, with VOD timestamps) ---
app.post('/spikes',
  mppx.charge({ amount: '0.002', description: 'Spike detection query' }),
  async (req, res) => {
    const withinMinutes = req.body?.withinMinutes || 5
    const spikes = getSpikes(withinMinutes)

    // Enrich with VOD timestamps
    const enriched = await Promise.all(
      spikes.map(async (spike) => {
        const vodTimestamp = spike.spikeAt ? await getVodTimestamp(spike.channel, spike.spikeAt) : null
        return {
          ...spike,
          vodTimestamp,
          vodUrl: vodTimestamp ? `https://twitch.tv/${spike.channel}?t=${vodTimestamp}` : null,
        }
      })
    )

    res.json({ spikes: enriched, count: enriched.length })
  }
)

// --- Alerts SSE (free to connect, spike events push in real-time) ---
app.get('/alerts', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  // Send initial heartbeat
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Listening for spikes...' })}\n\n`)

  // Optional channel filter
  const filterChannel = (req.query.channel as string)?.toLowerCase()
  const unsubscribe = onSpike(async (spike) => {
    if (filterChannel && spike.channel.toLowerCase() !== filterChannel) return

    // Add VOD timestamp
    const vodTimestamp = await getVodTimestamp(spike.channel, spike.spikeAt)
    const enrichedSpike = {
      type: 'spike',
      ...spike,
      vodTimestamp,
      vodUrl: vodTimestamp ? `https://twitch.tv/${spike.channel}?t=${vodTimestamp}` : null,
      timestamp: new Date(spike.spikeAt).toISOString(),
    }

    res.write(`data: ${JSON.stringify(enrichedSpike)}\n\n`)
  })

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)
  }, 30000)

  // Cleanup on disconnect
  req.on('close', () => {
    unsubscribe()
    clearInterval(heartbeat)
    console.log('[alerts] Client disconnected')
  })

  console.log(`[alerts] Client connected${filterChannel ? ` (filter: ${filterChannel})` : ''}`)
})

// --- Watch (session-based, pay per spike with LLM classification) ---
app.post('/watch/:channel',
  mppx.session({ amount: '0.001', unitType: 'spike', description: 'Watch channel for classified spikes' }),
  async (req, res) => {
    const channel = req.params.channel.toLowerCase()
    const viewers = await getViewerCount(channel)

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    res.write(`data: ${JSON.stringify({ type: 'watching', channel, viewers })}\n\n`)

    const unsubscribe = onSpike(async (spike) => {
      if (spike.channel.toLowerCase() !== channel) return

      // Classify with LLM
      const chatSnapshot = spike.chatSnapshot || []
      const classification = await classifySpike(chatSnapshot).catch(() => null)

      const vodTimestamp = await getVodTimestamp(spike.channel, spike.spikeAt).catch(() => null)

      const event = {
        type: 'spike',
        channel: spike.channel,
        viewers: spike.viewers,
        burst: spike.burst,
        baseline: spike.baseline,
        jumpPercent: spike.jumpPercent,
        mood: classification?.mood || spike.vibe,
        description: classification?.description || null,
        clipWorthy: classification?.clipWorthy || false,
        vodTimestamp,
        vodUrl: vodTimestamp ? `https://twitch.tv/${spike.channel}?t=${vodTimestamp}` : null,
        timestamp: new Date(spike.spikeAt).toISOString(),
      }

      res.write(`data: ${JSON.stringify(event)}\n\n`)
    })

    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)
    }, 30000)

    req.on('close', () => {
      unsubscribe()
      clearInterval(heartbeat)
      console.log(`[watch] ${channel} — client disconnected`)
    })

    console.log(`[watch] ${channel} — session started (${viewers ? viewers + ' viewers' : 'unknown'})`)
  }
)

// --- Summarize (paid, calls LLM via MPP) ---
app.post('/summarize',
  mppx.charge({ amount: '0.01', description: 'LLM chat summarization' }),
  async (req, res) => {
    const { channel } = req.body || {}
    if (!channel) {
      return res.status(400).json({ error: 'Missing "channel" in request body' })
    }

    try {
      const result = await summarizeChannel(channel)
      res.json({ channel, ...result })
    } catch (err: any) {
      console.error('[summarize] Error:', err)
      res.status(500).json({ error: 'Failed to summarize channel', detail: err.message })
    }
  }
)

// --- Classify a moment (debug, uses LLM) ---
app.get('/moments/:id/classify', async (req, res) => {
  const moment = getMomentById(parseInt(req.params.id))
  if (!moment) return res.status(404).json({ error: 'Moment not found' })

  const result = await classifySpike(moment.chatSnapshot)
  if (result) {
    moment.mood = result.mood
    moment.description = result.description
  }
  res.json({ channel: moment.channel, jumpPercent: moment.jumpPercent, vibe: moment.vibe, mood: result?.mood, description: result?.description, chatSnapshot: moment.chatSnapshot.slice(0, 10) })
})

// --- Moments (auto-captured spike moments) ---
app.post('/moments',
  mppx.charge({ amount: '0.001', description: 'Captured moments query' }),
  (req, res) => {
    const { channel, clipWorthyOnly, limit } = req.body || {}
    const result = getMoments({ channel, clipWorthyOnly, limit: limit || 20 })
    res.json({ moments: result, count: result.length })
  }
)

app.get('/moments/latest/:channel', (req, res) => {
  const result = getMoments({ channel: req.params.channel, limit: 1 })
  if (result.length === 0) return res.status(404).json({ error: 'No moments for this channel' })
  res.json(result[0])
})

// --- Clip page — embeds Twitch player at the right timestamp ---
app.get('/clip/:id', (req, res) => {
  const moment = getMomentById(parseInt(req.params.id))
  if (!moment) return res.status(404).send('Moment not found')

  const t = moment.clipStart || moment.vodTimestamp || '0h0m0s'
  // Parse VOD timestamp to seconds for embed
  const match = t.match(/(\d+)h(\d+)m(\d+)s/)
  const seconds = match ? parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) : 0

  res.send(`<!DOCTYPE html>
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
    <iframe src="https://player.twitch.tv/?channel=${moment.channel}&parent=${req.hostname}&time=${t}&autoplay=true&muted=false" allowfullscreen></iframe>
  </div>
  <div class="chat">
    ${moment.chatSnapshot.map(m => {
      const idx = m.indexOf(': ')
      return idx > -1 ? `<div><span class="u">${m.slice(0, idx)}:</span> ${m.slice(idx + 2)}</div>` : `<div>${m}</div>`
    }).join('')}
  </div>
</body></html>`)
})

app.get('/moments/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const moment = getMomentById(id)
  if (!moment) {
    return res.status(404).json({ error: `Moment #${id} not found` })
  }
  res.json(moment)
})

// --- Start ---
app.listen(PORT, () => {
  console.log(`[server] Clippy API running on http://localhost:${PORT}`)
  console.log(`[server] MPP payments enabled — recipient: ${WALLET}`)
  console.log(`[server] Connecting to Twitch firehose...`)
  connectFirehose()
  startMomentCapture()
})
