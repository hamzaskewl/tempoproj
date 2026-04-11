import { db } from '../db/index.js'
import { moments as momentsTable } from '../db/schema.js'
import { eq, desc, and, sql } from 'drizzle-orm'

export interface Moment {
  id: number
  channel: string
  userId: string | null
  timestamp: string
  spikeAt: number
  clipStart: string | null
  clipEnd: string | null
  clipStartUrl: string | null
  clipEndUrl: string | null
  vodTimestamp: string | null
  vodUrl: string | null
  jumpPercent: number
  burst: number
  baseline: number
  mood: string | null
  description: string | null
  vibe: string
  vibeIntensity: number
  clipWorthy: boolean
  clipUrl: string | null
  clipId: string | null
  chatSnapshot: string[]
}

// In-memory cache for recent moments (fast reads)
export const memMoments: Moment[] = []
export let nextMemId = 1
export function bumpMemId() { return nextMemId++ }

function rowToMoment(r: any): Moment {
  return {
    id: r.id, channel: r.channel, userId: r.userId || null,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
    spikeAt: Number(r.spikeAt),
    clipStart: r.clipStart, clipEnd: r.clipEnd,
    clipStartUrl: r.clipStartUrl, clipEndUrl: r.clipEndUrl,
    vodTimestamp: r.vodTimestamp, vodUrl: r.vodUrl,
    jumpPercent: r.jumpPercent, burst: r.burst, baseline: r.baseline,
    mood: r.mood, description: r.description,
    vibe: r.vibe, vibeIntensity: r.vibeIntensity,
    clipWorthy: r.clipWorthy ?? false,
    clipUrl: r.clipUrl, clipId: r.clipId,
    chatSnapshot: (r.chatSnapshot as string[]) || [],
  }
}

export async function saveMoment(moment: Moment): Promise<number> {
  if (db) {
    const existing = await db.select({ id: momentsTable.id }).from(momentsTable)
      .where(and(
        eq(momentsTable.channel, moment.channel),
        eq(momentsTable.spikeAt, moment.spikeAt),
        moment.userId ? eq(momentsTable.userId, moment.userId) : sql`user_id IS NULL`
      )).limit(1)
    if (existing.length > 0) {
      console.log(`[moments] Skipping duplicate: ${moment.channel} spikeAt=${moment.spikeAt} userId=${moment.userId}`)
      return existing[0].id
    }
    const rows = await db.insert(momentsTable).values({
      channel: moment.channel, userId: moment.userId,
      timestamp: new Date(moment.timestamp), spikeAt: moment.spikeAt,
      jumpPercent: moment.jumpPercent, burst: moment.burst, baseline: moment.baseline,
      vibe: moment.vibe, vibeIntensity: moment.vibeIntensity, chatSnapshot: moment.chatSnapshot,
      mood: moment.mood, description: moment.description,
      clipWorthy: moment.clipWorthy, clipUrl: moment.clipUrl, clipId: moment.clipId,
      vodTimestamp: moment.vodTimestamp, vodUrl: moment.vodUrl,
      clipStart: moment.clipStart, clipEnd: moment.clipEnd,
      clipStartUrl: moment.clipStartUrl, clipEndUrl: moment.clipEndUrl,
    }).returning({ id: momentsTable.id })
    return rows[0].id
  }
  return moment.id
}

export async function updateMoment(id: number, updates: Partial<Moment>) {
  if (db) {
    const setObj: any = {}
    if (updates.mood !== undefined) setObj.mood = updates.mood
    if (updates.description !== undefined) setObj.description = updates.description
    if (updates.clipWorthy !== undefined) setObj.clipWorthy = updates.clipWorthy
    if (updates.clipUrl !== undefined) setObj.clipUrl = updates.clipUrl
    if (updates.clipId !== undefined) setObj.clipId = updates.clipId
    if (updates.vodTimestamp !== undefined) setObj.vodTimestamp = updates.vodTimestamp
    if (updates.vodUrl !== undefined) setObj.vodUrl = updates.vodUrl
    if (updates.clipStart !== undefined) setObj.clipStart = updates.clipStart
    if (updates.clipEnd !== undefined) setObj.clipEnd = updates.clipEnd
    if (updates.clipStartUrl !== undefined) setObj.clipStartUrl = updates.clipStartUrl
    if (updates.clipEndUrl !== undefined) setObj.clipEndUrl = updates.clipEndUrl
    if (Object.keys(setObj).length > 0) {
      await db.update(momentsTable).set(setObj).where(eq(momentsTable.id, id))
    }
  }
}

export async function getMomentsByUser(userId: string, limit: number = 50): Promise<Moment[]> {
  if (db) {
    const rows = await db.select().from(momentsTable)
      .where(sql`channel IN (SELECT channel FROM user_channels WHERE user_id = ${userId} AND confirmed = true) AND id IN (SELECT MIN(id) FROM moments GROUP BY channel, spike_at)`)
      .orderBy(desc(momentsTable.id)).limit(limit)
    return rows.map(rowToMoment)
  }
  return [...memMoments].reverse().slice(0, limit)
}

export async function getMoments(options?: { channel?: string; clipWorthyOnly?: boolean; limit?: number; offset?: number }): Promise<Moment[]> {
  if (db) {
    let whereClause = sql`id IN (SELECT MIN(id) FROM moments GROUP BY channel, spike_at)`
    if (options?.channel) whereClause = sql`${whereClause} AND channel = ${options.channel.toLowerCase()}`
    if (options?.clipWorthyOnly) whereClause = sql`${whereClause} AND clip_worthy = true`
    const rows = await db.select().from(momentsTable)
      .where(whereClause).orderBy(desc(momentsTable.id))
      .limit(options?.limit || 20).offset(options?.offset || 0)
    return rows.map(rowToMoment)
  }
  let result = [...memMoments]
  if (options?.channel) result = result.filter(m => m.channel.toLowerCase() === options.channel!.toLowerCase())
  if (options?.clipWorthyOnly) result = result.filter(m => m.clipWorthy)
  result.reverse()
  if (options?.limit) result = result.slice(0, options.limit)
  return result
}

export async function getMomentById(id: number): Promise<Moment | null> {
  if (db) {
    const rows = await db.select().from(momentsTable).where(eq(momentsTable.id, id))
    return rows.length > 0 ? rowToMoment(rows[0]) : null
  }
  return memMoments.find(m => m.id === id) || null
}

export async function getMomentStats(): Promise<{ total: number; clipped: number; topChannels: { channel: string; count: number }[] }> {
  if (db) {
    const totalRows = await db.select({ count: sql<number>`count(*)` }).from(momentsTable)
    const clippedRows = await db.select({ count: sql<number>`count(*)` }).from(momentsTable).where(sql`clip_url IS NOT NULL`)
    const channelRows = await db.select({
      channel: momentsTable.channel, count: sql<number>`count(*)`,
    }).from(momentsTable).groupBy(momentsTable.channel).orderBy(sql`count(*) DESC`).limit(10)
    return {
      total: Number(totalRows[0]?.count || 0),
      clipped: Number(clippedRows[0]?.count || 0),
      topChannels: channelRows.map(r => ({ channel: r.channel, count: Number(r.count) })),
    }
  }
  const clipped = memMoments.filter(m => m.clipUrl).length
  const channelMap = new Map<string, number>()
  for (const m of memMoments) channelMap.set(m.channel, (channelMap.get(m.channel) || 0) + 1)
  const topChannels = [...channelMap.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([channel, count]) => ({ channel, count }))
  return { total: memMoments.length, clipped, topChannels }
}

export async function getClippedMoments(limit: number = 20, offset: number = 0, channel?: string): Promise<Moment[]> {
  if (db) {
    let whereClause = sql`clip_url IS NOT NULL AND id IN (SELECT MIN(id) FROM moments WHERE clip_url IS NOT NULL GROUP BY channel, spike_at)`
    if (channel) whereClause = sql`${whereClause} AND channel = ${channel.toLowerCase()}`
    const rows = await db.select().from(momentsTable)
      .where(whereClause).orderBy(desc(momentsTable.id)).limit(limit).offset(offset)
    return rows.map(rowToMoment)
  }
  let result = memMoments.filter(m => m.clipUrl)
  if (channel) result = result.filter(m => m.channel.toLowerCase() === channel.toLowerCase())
  return result.reverse().slice(offset, offset + limit)
}

export async function getClippedMomentsCount(channel?: string): Promise<number> {
  if (db) {
    let whereClause = sql`clip_url IS NOT NULL AND id IN (SELECT MIN(id) FROM moments WHERE clip_url IS NOT NULL GROUP BY channel, spike_at)`
    if (channel) whereClause = sql`${whereClause} AND channel = ${channel.toLowerCase()}`
    const rows = await db.select({ count: sql<number>`count(*)` }).from(momentsTable).where(whereClause)
    return Number(rows[0]?.count || 0)
  }
  let result = memMoments.filter(m => m.clipUrl)
  if (channel) result = result.filter(m => m.channel.toLowerCase() === channel.toLowerCase())
  return result.length
}
