import { PublicKey } from '@solana/web3.js'
import { hasOracleKeypair } from './keypair'
import { moodToU8 } from './moods'
import {
  findMarketPda,
  createMarketIx,
  sendOracleTx,
  fetchAllMarkets,
  fetchMarket,
  getOracleProgram,
} from './client'
import { upsertMarketCache, syncMarketsCache } from './cache'
import { db } from '@/src/db/index'
import { marketsCache } from '@/src/db/schema'
import { and, eq, lt } from 'drizzle-orm'
import { AnchorProvider } from '@coral-xyz/anchor'
import { Transaction } from '@solana/web3.js'

let started = false

function getWatchlist(): string[] {
  return (process.env.ORACLE_WATCHLIST || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}

function getMoods(): string[] {
  return (process.env.ORACLE_MARKET_MOODS || 'hype').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}

function getWindowSeconds(): number {
  const n = parseInt(process.env.ORACLE_WINDOW_SECONDS || '300', 10)
  return Number.isFinite(n) && n > 0 ? n : 300
}

// Align a unix-seconds timestamp to the next window boundary.
export function nextWindowStart(nowSec: number, windowSec: number): number {
  return Math.floor(nowSec / windowSec) * windowSec + windowSec
}

export function currentWindowStart(nowSec: number, windowSec: number): number {
  return Math.floor(nowSec / windowSec) * windowSec
}

async function ensureMarketsForWindow(windowStart: number, windowEnd: number) {
  const channels = getWatchlist()
  const moods = getMoods()
  if (channels.length === 0 || moods.length === 0) return

  for (const channel of channels) {
    for (const moodStr of moods) {
      const mood = moodToU8(moodStr)
      if (mood == null) continue
      const [market] = findMarketPda(channel, mood, windowStart)
      const existing = await fetchMarket(market)
      if (existing) {
        await upsertMarketCache(existing)
        continue
      }
      try {
        const { ix } = await createMarketIx(channel, mood, windowStart, windowEnd)
        const sig = await sendOracleTx([ix])
        console.log(`[oracle] opened market ${moodStr}@${channel} window=${windowStart} tx=${sig}`)
        const fresh = await fetchMarket(market)
        if (fresh) await upsertMarketCache(fresh)
      } catch (err: any) {
        console.error(`[oracle] createMarket failed for ${moodStr}@${channel}:`, err?.message || err)
      }
    }
  }
}

async function tickRollingMarkets() {
  const windowSec = getWindowSeconds()
  const now = Math.floor(Date.now() / 1000)
  // Ensure markets exist for current window (for backfilling on boot) AND next window.
  const curr = currentWindowStart(now, windowSec)
  await ensureMarketsForWindow(curr, curr + windowSec)
  const next = nextWindowStart(now, windowSec)
  if (next !== curr + windowSec) {
    await ensureMarketsForWindow(next, next + windowSec)
  }
}

async function tickExpirySweeper() {
  if (!db) return
  const now = Math.floor(Date.now() / 1000)
  let stale
  try {
    stale = await db.select().from(marketsCache)
      .where(and(eq(marketsCache.state, 'open'), lt(marketsCache.windowEnd, now)))
  } catch (err: any) {
    console.error('[oracle] sweeper query failed:', err?.message || err)
    return
  }
  if (stale.length === 0) return

  const { program, oracle, provider } = getOracleProgram()

  for (const row of stale) {
    try {
      const marketPk = new PublicKey(row.pda)
      const onChain = await fetchMarket(marketPk)
      if (!onChain) continue
      if (onChain.state !== 'open') {
        await upsertMarketCache(onChain)
        continue
      }
      const ix = await (program.methods as any)
        .resolveExpired()
        .accounts({ market: marketPk, payer: oracle.publicKey })
        .instruction()
      const tx = new Transaction().add(ix)
      const sig = await (provider as AnchorProvider).sendAndConfirm(tx, [oracle])
      console.log(`[oracle] resolved expired ${row.channel}/${row.mood} tx=${sig}`)
      const fresh = await fetchMarket(marketPk)
      if (fresh) await upsertMarketCache(fresh)
    } catch (err: any) {
      console.error('[oracle] resolveExpired failed:', err?.message || err)
    }
  }
}

export function startOracleScheduler(): void {
  if (started) return
  if (!hasOracleKeypair()) {
    console.log('[oracle] scheduler disabled: SOLANA_ORACLE_KEYPAIR_BASE64 not set')
    return
  }
  if (!process.env.CLIPPY_PROGRAM_ID || !process.env.HELIUS_KEY || !process.env.USDC_MINT) {
    console.log('[oracle] scheduler disabled: missing CLIPPY_PROGRAM_ID / HELIUS_KEY / USDC_MINT')
    return
  }
  started = true
  const windowSec = getWindowSeconds()
  console.log(`[oracle] scheduler started — window=${windowSec}s watchlist=${getWatchlist().join(',') || '(none)'} moods=${getMoods().join(',')}`)

  // Initial sync of existing chain state
  ;(async () => {
    try {
      const all = await fetchAllMarkets()
      await syncMarketsCache(all)
      console.log(`[oracle] synced ${all.length} markets from chain`)
    } catch (err: any) {
      console.error('[oracle] initial sync failed:', err?.message || err)
    }
  })()

  // Rolling market creator
  const runRolling = () => tickRollingMarkets().catch((err) => console.error('[oracle] rolling tick error:', err?.message || err))
  setTimeout(runRolling, 2000)
  setInterval(runRolling, windowSec * 1000)

  // Expiry sweeper — 15s safety net
  const runSweep = () => tickExpirySweeper().catch((err) => console.error('[oracle] sweep tick error:', err?.message || err))
  setInterval(runSweep, 15_000)
}
