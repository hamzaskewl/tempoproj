import { PublicKey } from '@solana/web3.js'
import { hasOracleKeypair } from './keypair'
import { moodToU8 } from './moods'
import { signAttestation } from './sign'
import {
  fetchAllMarkets,
  resolveWithReportIxs,
  sendOracleTx,
  fetchMarket,
  type MarketAccount,
} from './client'
import { upsertMarketCache } from './cache'

export { startOracleScheduler } from './scheduler'

// Cached open-markets lookup (<10s TTL) to avoid per-spike getProgramAccounts spam.
let openCache: { at: number; markets: MarketAccount[] } | null = null
const OPEN_CACHE_TTL_MS = 10_000

async function getOpenMarketsCached(): Promise<MarketAccount[]> {
  const now = Date.now()
  if (openCache && now - openCache.at < OPEN_CACHE_TTL_MS) return openCache.markets
  const all = await fetchAllMarkets()
  const open = all.filter((m) => m.state === 'open')
  openCache = { at: now, markets: open }
  return open
}

export interface ReportInput {
  channel: string
  mood: string       // mood string, e.g. "hype"
  spikeAt: number    // ms since epoch (matches existing `spike.spikeAt`)
}

// Fire-and-forget. Never throws — any error is logged and swallowed so the
// capture pipeline is not affected by oracle issues.
export async function reportMoodFired(input: ReportInput): Promise<void> {
  try {
    if (!hasOracleKeypair()) return
    if (!process.env.CLIPPY_PROGRAM_ID || !process.env.HELIUS_KEY || !process.env.USDC_MINT) return

    const moodU8 = moodToU8(input.mood)
    if (moodU8 == null) return

    const spikeSec = Math.floor(input.spikeAt / 1000)
    const channelLc = input.channel.toLowerCase()
    const open = await getOpenMarketsCached()
    const matches = open.filter(
      (m) =>
        m.channel.toLowerCase() === channelLc &&
        m.mood === moodU8 &&
        m.windowStart <= spikeSec &&
        spikeSec < m.windowEnd,
    )
    if (matches.length === 0) return

    for (const market of matches) {
      try {
        const attestation = signAttestation({
          channel: market.channel,
          mood: market.mood,
          windowStart: market.windowStart,
          windowEnd: market.windowEnd,
        })
        const ixs = await resolveWithReportIxs(market.pda, attestation)
        const sig = await sendOracleTx(ixs)
        console.log(`[oracle] attested ${input.mood}@${channelLc} — tx ${sig}`)
        const fresh = await fetchMarket(market.pda)
        if (fresh) await upsertMarketCache(fresh)
      } catch (err: any) {
        console.error(`[oracle] attestation tx failed for ${market.pda.toBase58()}:`, err?.message || err)
      }
    }
    openCache = null
  } catch (err: any) {
    console.error('[oracle] reportMoodFired failed:', err?.message || err)
  }
}

// Re-export reader helpers for API routes.
export { fetchMarket, fetchAllMarkets, fetchOpenMarkets } from './client'
