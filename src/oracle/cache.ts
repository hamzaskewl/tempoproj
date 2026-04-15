import { db } from '@/src/db/index'
import { marketsCache } from '@/src/db/schema'
import { sql } from 'drizzle-orm'
import type { MarketAccount } from './client'
import { u8ToMood } from './moods'

export async function upsertMarketCache(m: MarketAccount): Promise<void> {
  if (!db) return
  const mood = u8ToMood(m.mood) ?? `u${m.mood}`
  await db.insert(marketsCache).values({
    pda: m.pda.toBase58(),
    channel: m.channel,
    mood,
    windowStart: m.windowStart,
    windowEnd: m.windowEnd,
    state: m.state,
    totalYes: m.totalYes,
    totalNo: m.totalNo,
    resolvedAt: m.resolvedAt || null,
  }).onConflictDoUpdate({
    target: marketsCache.pda,
    set: {
      state: m.state,
      totalYes: m.totalYes,
      totalNo: m.totalNo,
      resolvedAt: m.resolvedAt || null,
      syncedAt: sql`NOW()`,
    },
  })
}

export async function syncMarketsCache(markets: MarketAccount[]): Promise<void> {
  for (const m of markets) {
    try { await upsertMarketCache(m) } catch (err: any) {
      console.error('[oracle] cache upsert failed:', err?.message || err)
    }
  }
}
