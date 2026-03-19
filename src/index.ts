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
import { startMomentCapture, getMoments, getMomentById } from './moments.js'
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
  transport: http('https://rpc.tempo.xyz'),
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
      'GET /alerts': { price: 'free', description: 'SSE stream of real-time spike alerts with VOD timestamps. Query params: ?channel=name, ?clipWorthy=true' },
      'POST /moments': { price: '$0.001', description: 'All auto-captured moments with VOD links and LLM summaries' },
      'GET /moments/:id': { price: 'free', description: 'Get a specific moment by ID' },
      'POST /watch/:channel': { price: '$0.001/spike (session)', description: 'SSE stream with LLM-classified spikes for a channel' },
    },
  })
})

app.get('/health', (_req, res) => {
  res.json({ ok: true, connected: isConnected(), ...getStats() })
})

// --- Trending (paid) ---
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
  const clipWorthyOnly = req.query.clipWorthy === 'true'

  const unsubscribe = onSpike(async (spike) => {
    // Apply filters
    if (filterChannel && spike.channel.toLowerCase() !== filterChannel) return
    if (clipWorthyOnly && !spike.clipWorthy) return

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

  console.log(`[alerts] Client connected${filterChannel ? ` (filter: ${filterChannel})` : ''}${clipWorthyOnly ? ' (clip-worthy only)' : ''}`)
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
