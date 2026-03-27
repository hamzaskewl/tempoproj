import { webcrypto } from 'node:crypto'
if (!globalThis.crypto) (globalThis as any).crypto = webcrypto
import 'dotenv/config'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { Mppx, tempo } from 'mppx/express'
import { createClient, http } from 'viem'
import { tempo as tempoChain } from 'viem/chains'
import { connectFirehose, getTrending, getChannel, getSpikes, getStats, isConnected, getVodTimestamp, getVodUrl, isStreamLive, onSpike, getViewerCount, setActiveChannel, removeActiveChannel } from './firehose.js'
import { summarizeChannel, classifySpike, classifySpikeDirect, summarizeChannelDirect, getLLMBudget, hasDirectAPI } from './summarize.js'
import { startMomentCapture, getMoments, getMomentById, watchChannel, unwatchChannel, getWatchedChannels, getMomentStats, getClippedMoments, initWatchedChannels, getUserChannels, addUserChannel, removeUserChannel, confirmUserChannel } from './moments.js'
import { setTwitchAuth, getTwitchAuth, createClip, restoreTwitchAuth } from './clip.js'
import { createUser, getUser, createSession, validateSession, destroySession, generateInviteCode, validateInviteCode, redeemInviteCode, getInviteCodes, getAllUsers, isAdmin, isDesignatedAdmin, checkRateLimit, getSessionCookie, clearSessionCookie, parseSessionToken, getAuthStats, createPendingRegistration, consumePendingRegistration } from './auth.js'
import { initDatabase } from './db/index.js'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(express.json())

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

// --- Twitch OAuth config ---
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || ''
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || ''
let twitchUserToken: string | null = null
let twitchUserId: string | null = null

// --- Auth middleware ---
async function requireAuth(req: any, res: any, next: any) {
  const token = parseSessionToken(req.headers.cookie)
  if (!token) return res.status(401).json({ error: 'Not authenticated' })
  const user = await validateSession(token)
  if (!user) return res.status(401).json({ error: 'Session expired' })
  req.user = user
  next()
}

async function requireAdmin(req: any, res: any, next: any) {
  const token = parseSessionToken(req.headers.cookie)
  if (!token) return res.status(401).json({ error: 'Not authenticated' })
  const user = await validateSession(token)
  if (!user) return res.status(401).json({ error: 'Session expired' })
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' })
  req.user = user
  next()
}

function rateLimit(req: any, res: any, next: any) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown'
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' })
  }
  next()
}

// --- Serve static files (but NOT demo.html) ---
app.use((req, res, next) => {
  if (req.path === '/demo.html') return res.status(404).send('Not found')
  next()
})
app.use(express.static(path.join(__dirname, '..', 'public')))

// --- Auth check endpoint ---
app.get('/auth/me', async (req, res) => {
  const token = parseSessionToken(req.headers.cookie)
  if (!token) return res.json({ authenticated: false })
  const user = await validateSession(token)
  if (!user) return res.json({ authenticated: false })
  res.json({
    authenticated: true,
    user: { id: user.id, username: user.username, profileImage: user.profileImage, role: user.role },
  })
})

// --- Twitch OAuth for user login ---
// Supports ?code=INVITE_CODE to auto-apply invite after OAuth
app.get('/auth/twitch', rateLimit, (req, res) => {
  const proto = req.get('x-forwarded-proto') || req.protocol
  const inviteCode = req.query.code as string || req.query.invite as string || ''
  // Pass invite code through OAuth state param
  const state = inviteCode ? Buffer.from(JSON.stringify({ invite: inviteCode })).toString('base64url') : ''
  const redirect = `${proto}://${req.get('host')}/auth/twitch/callback`
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=clips:edit+editor:manage:clips${state ? `&state=${state}` : ''}`
  res.redirect(url)
})

app.get('/auth/twitch/callback', rateLimit, async (req, res) => {
  const code = req.query.code as string
  if (!code) return res.status(400).send('Missing code')

  // Extract invite code from state param
  let inviteFromUrl = ''
  const stateParam = req.query.state as string
  if (stateParam) {
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
      inviteFromUrl = decoded.invite || ''
    } catch {}
  }

  const proto = req.get('x-forwarded-proto') || req.protocol
  const redirect = `${proto}://${req.get('host')}/auth/twitch/callback`

  try {
    // Exchange code for token
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
      return res.redirect('/login.html?error=oauth_failed')
    }

    // Get Twitch user info
    const meRes = await fetch('https://api.twitch.tv/helix/users', {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${data.access_token}` },
    })
    const meData = await meRes.json() as any
    const twitchUser = meData.data?.[0]
    if (!twitchUser) return res.redirect('/login.html?error=user_fetch_failed')

    const twitchId = twitchUser.id
    const username = twitchUser.display_name || twitchUser.login
    const profileImage = twitchUser.profile_image_url || ''

    // Store token for clip creation (server-level, shared)
    twitchUserToken = data.access_token
    twitchUserId = twitchId
    setTwitchAuth(data.access_token, twitchId, data.refresh_token)

    // 1. Existing user — log them in
    let user = await getUser(twitchId)
    if (user) {
      const isSecure = proto === 'https'
      const session = await createSession(user.id)
      res.setHeader('Set-Cookie', getSessionCookie(session.token, isSecure))
      console.log(`[auth] Login: ${username} (${twitchId}) role=${user.role}`)
      return res.redirect('/dashboard.html')
    }

    // 2. Designated admin — create + log in, no invite needed
    if (isDesignatedAdmin(username)) {
      user = await createUser(twitchId, username, profileImage, 'admin_env', true)
      const isSecure = proto === 'https'
      const session = await createSession(user.id)
      res.setHeader('Set-Cookie', getSessionCookie(session.token, isSecure))
      console.log(`[auth] Admin login: ${username} (${twitchId})`)
      return res.redirect('/dashboard.html')
    }

    // 3. New user — if invite code from URL, try to auto-apply
    if (inviteFromUrl) {
      const valid = await validateInviteCode(inviteFromUrl)
      if (valid) {
        await redeemInviteCode(inviteFromUrl, twitchId, username)
        user = await createUser(twitchId, username, profileImage, inviteFromUrl, true)
        const isSecure = proto === 'https'
        const session = await createSession(user.id)
        res.setHeader('Set-Cookie', getSessionCookie(session.token, isSecure))
        console.log(`[auth] New user auto-registered: ${username} (${twitchId}) with invite from URL: ${inviteFromUrl}`)
        return res.redirect('/dashboard.html')
      }
    }

    // 4. New user, no valid invite from URL — send to invite code page
    const pending = createPendingRegistration(twitchId, username, profileImage, data.access_token)
    const avatarParam = profileImage ? `&avatar=${encodeURIComponent(profileImage)}` : ''
    const inviteParam = inviteFromUrl ? `&prefill=${encodeURIComponent(inviteFromUrl)}` : ''
    console.log(`[auth] New user ${username} — redirecting to invite code page`)
    res.redirect(`/invite.html?token=${pending.token}&name=${encodeURIComponent(username)}${avatarParam}${inviteParam}`)
  } catch (err: any) {
    console.error('[auth] OAuth error:', err.message)
    res.redirect('/login.html?error=server_error')
  }
})

// --- Verify invite code for pending registration ---
app.get('/auth/verify-invite', rateLimit, async (req, res) => {
  const token = req.query.token as string
  const inviteCode = req.query.invite as string

  if (!token || !inviteCode) return res.redirect('/login.html')

  const pending = consumePendingRegistration(token)
  if (!pending) return res.redirect('/login.html?error=server_error')

  if (!(await validateInviteCode(inviteCode))) {
    const newPending = createPendingRegistration(pending.twitchId, pending.username, pending.profileImage, pending.twitchAccessToken)
    const avatarParam = pending.profileImage ? `&avatar=${encodeURIComponent(pending.profileImage)}` : ''
    return res.redirect(`/invite.html?token=${newPending.token}&name=${encodeURIComponent(pending.username)}${avatarParam}&error=invalid_invite`)
  }

  await redeemInviteCode(inviteCode, pending.twitchId, pending.username)
  const user = await createUser(pending.twitchId, pending.username, pending.profileImage, inviteCode, true)

  const proto = req.get('x-forwarded-proto') || req.protocol
  const isSecure = proto === 'https'
  const session = await createSession(user.id)
  res.setHeader('Set-Cookie', getSessionCookie(session.token, isSecure))

  console.log(`[auth] New user registered: ${pending.username} (${pending.twitchId}) with invite ${inviteCode}`)
  res.redirect('/dashboard.html')
})

app.post('/auth/logout', async (req, res) => {
  const token = parseSessionToken(req.headers.cookie)
  if (token) await destroySession(token)
  const proto = req.get('x-forwarded-proto') || req.protocol
  const isSecure = proto === 'https'
  res.setHeader('Set-Cookie', clearSessionCookie(isSecure))
  res.json({ ok: true })
})

// --- Admin API ---
app.post('/admin/invite', requireAdmin, async (req, res) => {
  const { label, maxUses } = req.body || {}
  const uses = Math.min(Math.max(parseInt(maxUses) || 1, 1), 10000)
  const invite = await generateInviteCode((req as any).user.id, label || '', uses)
  res.json({ code: invite.code, label: invite.label, maxUses: invite.maxUses })
})

app.get('/admin/invites', requireAdmin, async (_req, res) => {
  res.json({ invites: await getInviteCodes() })
})

app.get('/admin/users', requireAdmin, async (_req, res) => {
  res.json({ users: await getAllUsers() })
})

app.get('/admin/budget', requireAdmin, (_req, res) => {
  res.json(getLLMBudget())
})

app.get('/admin/stats', requireAdmin, async (_req, res) => {
  const auth = await getAuthStats()
  const llm = getLLMBudget()
  const system = getStats()
  res.json({ auth, llm, system })
})

// --- Health / Status (free, public) ---
app.get('/api', (_req, res) => {
  const stats = getStats()
  res.json({
    service: 'Clippy',
    description: 'Real-time Twitch stream intelligence. Detects chat spikes, classifies moments with AI, auto-clips highlights.',
    version: '3.0.0',
    status: stats.connected ? 'live' : 'connecting',
    ...stats,
    llms_txt: '/llms.txt',
    docs: '/docs.html',
    endpoints: {
      free: {
        'GET /health': 'Status check',
        'GET /trending': 'Top 10 channels by burst rate',
        'GET /alerts': 'SSE spike feed. ?channel=name to filter',
        'GET /moments/:id': 'Get a moment by ID',
        'GET /moments/latest/:channel': 'Latest moment for a channel',
      },
      authenticated: {
        'GET /channel-stats/:name': 'Live channel rates + vibes',
        'POST /track/:channel': 'Add channel to tracking',
        'DELETE /track/:channel': 'Remove from tracking',
        'POST /my/channels': 'Add a channel to your slots (max 3)',
        'DELETE /my/channels/:channel': 'Remove channel from your slots',
        'POST /my/channels/:channel/confirm': 'Confirm channel (must be live)',
      },
      paid_mpp: {
        'POST /trending': { price: '$0.001', description: 'Full trending list' },
        'POST /channel': { price: '$0.001', description: 'Channel stats + recent messages' },
        'POST /spikes': { price: '$0.002', description: 'All active spikes with VOD links' },
        'POST /summarize': { price: '$0.01', description: 'LLM summary of channel chat' },
        'POST /moments': { price: '$0.001', description: 'List captured moments' },
        'POST /watch/:channel': { price: '$0.03/spike', description: 'SSE stream with AI-classified spikes + auto-clipping' },
      },
    },
  })
})

app.get('/health', (_req, res) => {
  const stats = getStats()
  res.json({ ok: true, ...stats, connected: isConnected() })
})

// --- Per-user channel management (max 3 slots) ---
app.get('/my/channels', requireAuth, async (req, res) => {
  const channels = await getUserChannels((req as any).user.id)
  res.json({ channels, maxChannels: 3 })
})

app.post('/my/channels', requireAuth, async (req, res) => {
  const { channel } = req.body || {}
  if (!channel) return res.status(400).json({ error: 'Missing channel name' })
  const ch = channel.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  if (!ch) return res.status(400).json({ error: 'Invalid channel name' })

  const result = await addUserChannel((req as any).user.id, ch)
  if (!result.ok) return res.status(400).json({ error: result.error })
  res.json({ channels: result.channels, maxChannels: 3 })
})

app.delete('/my/channels/:channel', requireAuth, async (req, res) => {
  const ch = req.params.channel.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  const result = await removeUserChannel((req as any).user.id, ch)
  res.json({ channels: result.channels, maxChannels: 3 })
})

app.post('/my/channels/:channel/confirm', requireAuth, async (req, res) => {
  const ch = req.params.channel.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  const result = await confirmUserChannel((req as any).user.id, ch)
  if (!result.ok) return res.status(400).json({ error: result.error })
  const channels = await getUserChannels((req as any).user.id)
  res.json({ channels, maxChannels: 3 })
})

// --- Create a clip for a moment ---
app.post('/clip/:id', requireAuth, async (req, res) => {
  const moment = await getMomentById(parseInt(req.params.id))
  if (!moment) return res.status(404).json({ error: 'Moment not found' })
  if (!twitchUserToken) return res.status(401).json({ error: 'Twitch not connected. Visit /auth/twitch first.' })

  try {
    const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(moment.channel)}`, {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${twitchUserToken}` },
    })
    const userData = await userRes.json() as any
    const broadcasterId = userData.data?.[0]?.id
    if (!broadcasterId) return res.status(404).json({ error: `Broadcaster "${moment.channel}" not found` })

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

// --- Legacy watchlist (requires auth) — kept for backwards compat ---
app.post('/watch-clip/:channel', requireAuth, async (req, res) => {
  const channel = req.params.channel.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  if (!channel) return res.status(400).json({ error: 'Invalid channel name' })
  await watchChannel(channel)
  res.json({ watching: getWatchedChannels() })
})

app.delete('/watch-clip/:channel', requireAuth, async (req, res) => {
  const channel = req.params.channel.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  await unwatchChannel(channel)
  res.json({ watching: getWatchedChannels() })
})

app.get('/watch-clip', requireAuth, (_req, res) => {
  res.json({ watching: getWatchedChannels() })
})

// --- Channel stats (requires auth for dashboard) ---
app.get('/channel-stats/:name', requireAuth, async (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  const data = getChannel(name)
  if (!data) return res.status(404).json({ error: 'Not found' })
  const viewers = await getViewerCount(name).catch(() => null)
  const live = await isStreamLive(name).catch(() => false)
  res.json({
    channel: data.channel,
    rate: data.sustained,
    burst: data.burst,
    baseline: data.baseline,
    jumpPercent: data.jumpPercent,
    isSpike: data.isSpike,
    vibe: data.vibe,
    viewers,
    live,
  })
})

// --- Track channels (requires auth) ---
app.post('/track/:channel', requireAuth, (req, res) => {
  const channel = req.params.channel.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  if (!channel) return res.status(400).json({ error: 'Invalid channel name' })
  setActiveChannel(channel)
  res.json({ tracking: channel })
})

app.delete('/track/:channel', requireAuth, (req, res) => {
  const channel = req.params.channel.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
  removeActiveChannel(channel)
  res.json({ removed: channel })
})

// --- Trending (free for dashboard, top 10 only) ---
app.get('/trending', (_req, res) => {
  res.json(getTrending(10))
})

// --- Trending (paid via MPP, full) ---
app.post('/trending',
  mppx.charge({ amount: '0.001', description: 'Trending channels query' }),
  (req, res) => {
    const limit = req.body?.limit || 20
    const result = getTrending(limit)
    res.json(result)
  }
)

// --- Channel (paid via MPP) ---
app.post('/channel',
  mppx.charge({ amount: '0.001', description: 'Channel stats query' }),
  (req, res) => {
    const { channel } = req.body || {}
    if (!channel) return res.status(400).json({ error: 'Missing "channel" in request body' })
    const result = getChannel(channel)
    if (!result) return res.status(404).json({ error: `Channel "${channel}" not found or no recent activity` })
    res.json(result)
  }
)

// --- Spikes (paid via MPP) ---
app.post('/spikes',
  mppx.charge({ amount: '0.002', description: 'Spike detection query' }),
  async (req, res) => {
    const withinMinutes = req.body?.withinMinutes || 5
    const spikes = getSpikes(withinMinutes)
    const enriched = await Promise.all(
      spikes.map(async (spike) => {
        const vodTimestamp = spike.spikeAt ? await getVodTimestamp(spike.channel, spike.spikeAt) : null
        return {
          ...spike,
          vodTimestamp,
          vodUrl: vodTimestamp ? await getVodUrl(spike.channel, vodTimestamp) : null,
        }
      })
    )
    res.json({ spikes: enriched, count: enriched.length })
  }
)

// --- Alerts SSE (free, public — spike events push in real-time) ---
app.get('/alerts', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Listening for spikes...' })}\n\n`)

  const filterChannel = (req.query.channel as string)?.toLowerCase()
  const unsubscribe = onSpike(async (spike) => {
    if (filterChannel && spike.channel.toLowerCase() !== filterChannel) return

    const vodTimestamp = await getVodTimestamp(spike.channel, spike.spikeAt)
    const enrichedSpike = {
      type: 'spike',
      ...spike,
      vodTimestamp,
      vodUrl: vodTimestamp ? await getVodUrl(spike.channel, vodTimestamp) : null,
      timestamp: new Date(spike.spikeAt).toISOString(),
    }

    res.write(`data: ${JSON.stringify(enrichedSpike)}\n\n`)
  })

  let offlineStreak = 0
  const heartbeat = setInterval(async () => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)

    if (filterChannel) {
      const live = await isStreamLive(filterChannel)
      if (!live) {
        offlineStreak++
        if (offlineStreak >= 2) {
          res.write(`data: ${JSON.stringify({ type: 'stream_ended', channel: filterChannel, message: 'Stream went offline.' })}\n\n`)
          res.end()
          return
        }
      } else {
        offlineStreak = 0
      }
    }
  }, 60_000)

  req.on('close', () => {
    unsubscribe()
    clearInterval(heartbeat)
    console.log('[alerts] Client disconnected')
  })

  console.log(`[alerts] Client connected${filterChannel ? ` (filter: ${filterChannel})` : ''}`)
})

// --- Watch (session-based MPP, pay per spike with LLM classification) ---
app.post('/watch/:channel',
  mppx.session({ amount: '0.03', unitType: 'spike', description: 'Watch channel for AI-classified spikes + auto-clipping' }),
  async (req, res) => {
    const channel = (Array.isArray(req.params.channel) ? req.params.channel[0] : req.params.channel).toLowerCase()
    const viewers = await getViewerCount(channel)

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    res.write(`data: ${JSON.stringify({ type: 'watching', channel, viewers })}\n\n`)

    const unsubscribe = onSpike(async (spike) => {
      if (spike.channel.toLowerCase() !== channel) return

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
        vodUrl: vodTimestamp ? await getVodUrl(spike.channel, vodTimestamp) : null,
        timestamp: new Date(spike.spikeAt).toISOString(),
      }

      res.write(`data: ${JSON.stringify(event)}\n\n`)
    })

    let offlineStreak = 0
    const heartbeat = setInterval(async () => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)

      const live = await isStreamLive(channel)
      if (!live) {
        offlineStreak++
        if (offlineStreak >= 2) {
          res.write(`data: ${JSON.stringify({ type: 'stream_ended', channel, message: 'Stream went offline. Session closed, unused deposit refunded.' })}\n\n`)
          res.end()
          return
        }
      } else {
        offlineStreak = 0
      }
    }, 60_000)

    req.on('close', () => {
      unsubscribe()
      clearInterval(heartbeat)
      console.log(`[watch] ${channel} — client disconnected`)
    })

    console.log(`[watch] ${channel} — session started (${viewers ? viewers + ' viewers' : 'unknown'})`)
  }
)

// --- Summarize (paid via MPP) ---
app.post('/summarize',
  mppx.charge({ amount: '0.01', description: 'LLM chat summarization' }),
  async (req, res) => {
    const { channel } = req.body || {}
    if (!channel) return res.status(400).json({ error: 'Missing "channel" in request body' })
    try {
      const result = await summarizeChannel(channel)
      res.json({ channel, ...result })
    } catch (err: any) {
      console.error('[summarize] Error:', err)
      res.status(500).json({ error: 'Failed to summarize channel', detail: err.message })
    }
  }
)

// --- Classify a moment (auth required, uses direct API) ---
app.get('/moments/:id/classify', requireAuth, async (req, res) => {
  const moment = await getMomentById(parseInt(req.params.id))
  if (!moment) return res.status(404).json({ error: 'Moment not found' })

  // Use direct API if available, fallback to MPP
  const classify = hasDirectAPI() ? classifySpikeDirect : classifySpike
  const result = await classify(moment.chatSnapshot)
  if (result) {
    moment.mood = result.mood
    moment.description = result.description
  }
  res.json({ channel: moment.channel, jumpPercent: moment.jumpPercent, vibe: moment.vibe, mood: result?.mood, description: result?.description, chatSnapshot: moment.chatSnapshot.slice(0, 10) })
})

// --- Moments (paid via MPP for agents) ---
app.post('/moments',
  mppx.charge({ amount: '0.001', description: 'Captured moments query' }),
  async (req, res) => {
    const { channel, clipWorthyOnly, limit } = req.body || {}
    const result = await getMoments({ channel, clipWorthyOnly, limit: limit || 20 })
    res.json({ moments: result, count: result.length })
  }
)

app.get('/moments/latest/:channel', async (req, res) => {
  const result = await getMoments({ channel: req.params.channel, limit: 1 })
  if (result.length === 0) return res.status(404).json({ error: 'No moments for this channel' })
  res.json(result[0])
})

// --- Clip page — embeds Twitch player at the right timestamp ---
app.get('/clip/:id', async (req, res) => {
  const moment = await getMomentById(parseInt(req.params.id))
  if (!moment) return res.status(404).send('Moment not found')

  const t = moment.clipStart || moment.vodTimestamp || '0h0m0s'
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
    <iframe src="https://player.twitch.tv/?channel=${encodeURIComponent(moment.channel)}&parent=${req.hostname}&time=${t}&autoplay=true&muted=false" allowfullscreen></iframe>
  </div>
  <div class="chat">
    ${moment.chatSnapshot.map(m => {
      const idx = m.indexOf(': ')
      return idx > -1 ? `<div><span class="u">${m.slice(0, idx)}:</span> ${m.slice(idx + 2)}</div>` : `<div>${m}</div>`
    }).join('')}
  </div>
</body></html>`)
})

app.get('/moments/:id', async (req, res) => {
  const id = parseInt(req.params.id)
  const moment = await getMomentById(id)
  if (!moment) return res.status(404).json({ error: `Moment #${id} not found` })
  res.json(moment)
})

// --- Clips directory API (public) ---
app.get('/api/clips', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
  const offset = parseInt(req.query.offset as string) || 0
  const clips = await getClippedMoments(limit, offset)
  const stats = await getMomentStats()
  res.json({ clips, stats })
})

// --- Public stats API for landing page ---
app.get('/api/stats', async (_req, res) => {
  const stats = getStats()
  const momentStats = await getMomentStats()
  const trending = getTrending(5)
  res.json({
    connected: stats.connected,
    totalChannels: stats.totalChannels,
    totalMsgsPerSec: stats.totalMsgsPerSec,
    moments: momentStats,
    trending: trending.channels || [],
  })
})

// --- Start ---
async function start() {
  await initDatabase()
  await initWatchedChannels()
  await restoreTwitchAuth()

  app.listen(PORT, () => {
    console.log(`[server] Clippy API running on http://localhost:${PORT}`)
    console.log(`[server] MPP payments enabled — recipient: ${WALLET}`)
    console.log(`[server] Direct Anthropic API: ${hasDirectAPI() ? 'enabled' : 'disabled (set ANTHROPIC_API_KEY)'}`)
    console.log(`[server] LLM budget: $${getLLMBudget().limit}`)
    console.log(`[server] Connecting to Twitch firehose...`)
    connectFirehose()
    startMomentCapture()
  })
}

start().catch(err => {
  console.error('[server] Failed to start:', err)
  process.exit(1)
})
