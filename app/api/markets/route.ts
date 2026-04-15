import { ensureStarted } from '@/lib/server-init'
import { db } from '@/src/db/index'
import { marketsCache } from '@/src/db/schema'
import { eq } from 'drizzle-orm'

const REFRESH_AGE_MS = 10_000

function serializeCache(rows: any[]) {
  return rows.map((r) => ({
    pda: r.pda,
    channel: r.channel,
    mood: r.mood,
    windowStart: Number(r.windowStart),
    windowEnd: Number(r.windowEnd),
    state: r.state,
    totalYes: r.totalYes?.toString?.() ?? String(r.totalYes ?? '0'),
    totalNo: r.totalNo?.toString?.() ?? String(r.totalNo ?? '0'),
    resolvedAt: r.resolvedAt != null ? Number(r.resolvedAt) : null,
    syncedAt: r.syncedAt instanceof Date ? r.syncedAt.toISOString() : r.syncedAt,
  }))
}

export async function GET() {
  ensureStarted()
  if (!db) return Response.json([], { status: 200 })

  let rows = await db.select().from(marketsCache).where(eq(marketsCache.state, 'open'))

  const now = Date.now()
  const stale = rows.some((r: any) => {
    const ts = r.syncedAt instanceof Date ? r.syncedAt.getTime() : new Date(r.syncedAt).getTime()
    return now - ts > REFRESH_AGE_MS
  })

  if (stale || rows.length === 0) {
    try {
      const { fetchOpenMarkets } = await import('@/src/oracle/index')
      const { syncMarketsCache } = await import('@/src/oracle/cache')
      const onChain = await fetchOpenMarkets()
      await syncMarketsCache(onChain)
      rows = await db.select().from(marketsCache).where(eq(marketsCache.state, 'open'))
    } catch (err: any) {
      // On-chain refresh failures fall back to whatever's in cache.
      console.error('[api/markets] refresh failed:', err?.message || err)
    }
  }

  return Response.json(serializeCache(rows))
}
