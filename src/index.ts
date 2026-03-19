import 'dotenv/config'
import express from 'express'
import { Mppx, tempo } from 'mppx/express'
import { createClient, http } from 'viem'
import { tempo as tempoChain } from 'viem/chains'
import { connectFirehose, getTrending, getChannel, getSpikes, getStats, isConnected, getVodTimestamp, onSpike } from './firehose.js'
import { summarizeChannel } from './summarize.js'
import crypto from 'crypto'

const app = express()
app.use(express.json())

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

// Create mppx payment handler
const mppx = Mppx.create({
  methods: [
    tempo.charge({
      currency: USDC,
      recipient: WALLET as `0x${string}`,
      getClient: () => client,
    }),
  ],
  secretKey,
  realm: 'stream-intel.local',
})

// --- Health / Status (free) ---
app.get('/', (_req, res) => {
  const stats = getStats()
  res.json({
    service: 'Stream Intelligence API',
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

// --- Start ---
app.listen(PORT, () => {
  console.log(`[server] Stream Intelligence API running on http://localhost:${PORT}`)
  console.log(`[server] MPP payments enabled — recipient: ${WALLET}`)
  console.log(`[server] Connecting to Twitch firehose...`)
  connectFirehose()
})
