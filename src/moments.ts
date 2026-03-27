import { onSpike, getRecentMessages, getVodTimestamp, getVodUrl, setActiveChannel, removeActiveChannel } from './firehose.js'
import { classifySpikeDirect, classifySpike, hasDirectAPI } from './summarize.js'
import { createClip, hasTwitchAuth } from './clip.js'
import { db } from './db/index.js'
import { moments as momentsTable, watchedChannels as watchedTable } from './db/schema.js'
import { eq, desc, and, sql } from 'drizzle-orm'

export interface Moment {
  id: number
  channel: string
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
const memMoments: Moment[] = []
let nextMemId = 1

// Watched channels (synced to DB)
const watchedChannelsSet = new Set<string>()

export async function initWatchedChannels() {
  if (db) {
    const rows = await db.select().from(watchedTable)
    for (const r of rows) {
      watchedChannelsSet.add(r.channel)
      setActiveChannel(r.channel)
    }
    if (rows.length > 0) {
      console.log(`[moments] Restored ${rows.length} watched channels from DB`)
    }
  }
}

export async function watchChannel(channel: string) {
  const ch = channel.toLowerCase()
  watchedChannelsSet.add(ch)
  setActiveChannel(ch)
  if (db) {
    await db.insert(watchedTable).values({ channel: ch }).onConflictDoNothing()
  }
  console.log(`[watch] Now clipping: ${ch}`)
}

export async function unwatchChannel(channel: string) {
  const ch = channel.toLowerCase()
  watchedChannelsSet.delete(ch)
  removeActiveChannel(ch)
  if (db) {
    await db.delete(watchedTable).where(eq(watchedTable.channel, ch))
  }
}

export function getWatchedChannels() {
  return [...watchedChannelsSet]
}

async function saveMoment(moment: Moment): Promise<number> {
  if (db) {
    const rows = await db.insert(momentsTable).values({
      channel: moment.channel,
      timestamp: new Date(moment.timestamp),
      spikeAt: moment.spikeAt,
      jumpPercent: moment.jumpPercent,
      burst: moment.burst,
      baseline: moment.baseline,
      vibe: moment.vibe,
      vibeIntensity: moment.vibeIntensity,
      chatSnapshot: moment.chatSnapshot,
      mood: moment.mood,
      description: moment.description,
      clipWorthy: moment.clipWorthy,
      clipUrl: moment.clipUrl,
      clipId: moment.clipId,
      vodTimestamp: moment.vodTimestamp,
      vodUrl: moment.vodUrl,
      clipStart: moment.clipStart,
      clipEnd: moment.clipEnd,
      clipStartUrl: moment.clipStartUrl,
      clipEndUrl: moment.clipEndUrl,
    }).returning({ id: momentsTable.id })
    return rows[0].id
  }
  return moment.id
}

async function updateMoment(id: number, updates: Partial<Moment>) {
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

// Auto-capture moments when spikes happen
export function startMomentCapture() {
  console.log('[moments] Auto-capture enabled — storing moments on spike detection')

  onSpike(async (spike) => {
    if (spike.jumpPercent < 40) return

    const memId = nextMemId++
    const chatSnapshot = getRecentMessages(spike.channel, 50)
    const isWatched = watchedChannelsSet.has(spike.channel.toLowerCase())

    const moment: Moment = {
      id: memId,
      channel: spike.channel,
      timestamp: new Date(spike.spikeAt).toISOString(),
      spikeAt: spike.spikeAt,
      clipStart: null, clipEnd: null, clipStartUrl: null, clipEndUrl: null,
      vodTimestamp: null, vodUrl: null,
      jumpPercent: spike.jumpPercent,
      burst: spike.burst,
      baseline: spike.baseline,
      mood: null, description: null,
      vibe: spike.vibe,
      vibeIntensity: spike.vibeIntensity,
      clipWorthy: false,
      clipUrl: null, clipId: null,
      chatSnapshot,
    }

    memMoments.push(moment)
    console.log(`[moments] #${memId} captured: ${spike.channel} +${spike.jumpPercent}% (${spike.vibe})`)

    // For watched channels: classify with LLM + auto-clip
    if (isWatched) {
      try {
        // Use direct API if available, fallback to MPP
        const classify = hasDirectAPI() ? classifySpikeDirect : classifySpike
        const result = await classify(chatSnapshot)
        if (result) {
          moment.mood = result.mood
          moment.description = result.description
          moment.clipWorthy = result.clipWorthy
          console.log(`[moments] #${memId} LLM: ${result.mood} / clipWorthy=${result.clipWorthy} — "${result.description}"`)

          if (hasTwitchAuth()) {
            const clip = await createClip(spike.channel)
            if (clip) {
              moment.clipUrl = clip.clipUrl
              moment.clipId = clip.clipId
              console.log(`[moments] #${memId} clipped: ${clip.clipUrl}`)
            }
          }
        }
      } catch (err: any) {
        console.error(`[moments] #${memId} classify failed:`, err.message)
      }

      // Always try to clip watched channels
      if (hasTwitchAuth() && !moment.clipUrl) {
        try {
          const clip = await createClip(spike.channel)
          if (clip) {
            moment.clipUrl = clip.clipUrl
            moment.clipId = clip.clipId
            console.log(`[moments] #${memId} clipped: ${clip.clipUrl}`)
          }
        } catch {}
      }
    }

    // Enrich with VOD timestamps
    try {
      const vodTimestamp = await getVodTimestamp(spike.channel, spike.spikeAt)
      if (vodTimestamp) {
        moment.vodTimestamp = vodTimestamp
        moment.vodUrl = await getVodUrl(spike.channel, vodTimestamp)
        const startVod = await getVodTimestamp(spike.channel, spike.spikeAt - 10_000)
        const endVod = await getVodTimestamp(spike.channel, spike.spikeAt + 30_000)
        moment.clipStart = startVod
        moment.clipEnd = endVod
        moment.clipStartUrl = startVod ? await getVodUrl(spike.channel, startVod) : null
        moment.clipEndUrl = endVod ? await getVodUrl(spike.channel, endVod) : null
      }
    } catch {}

    // Save to DB
    try {
      const dbId = await saveMoment(moment)
      moment.id = dbId
    } catch (err: any) {
      console.error(`[moments] DB save failed:`, err.message)
    }

    // Keep max 500 in memory cache
    if (memMoments.length > 500) memMoments.shift()
  })
}

export async function getMoments(options?: { channel?: string; clipWorthyOnly?: boolean; limit?: number; offset?: number }): Promise<Moment[]> {
  if (db) {
    let query = db.select().from(momentsTable).orderBy(desc(momentsTable.id)).$dynamic()

    if (options?.channel) {
      query = query.where(eq(momentsTable.channel, options.channel.toLowerCase()))
    }
    if (options?.clipWorthyOnly) {
      query = query.where(eq(momentsTable.clipWorthy, true))
    }

    query = query.limit(options?.limit || 20)
    if (options?.offset) query = query.offset(options.offset)

    const rows = await query
    return rows.map(rowToMoment)
  }

  // In-memory fallback
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
      channel: momentsTable.channel,
      count: sql<number>`count(*)`,
    }).from(momentsTable).groupBy(momentsTable.channel).orderBy(sql`count(*) DESC`).limit(10)

    return {
      total: Number(totalRows[0]?.count || 0),
      clipped: Number(clippedRows[0]?.count || 0),
      topChannels: channelRows.map(r => ({ channel: r.channel, count: Number(r.count) })),
    }
  }
  const clipped = memMoments.filter(m => m.clipUrl).length
  const channelMap = new Map<string, number>()
  for (const m of memMoments) {
    channelMap.set(m.channel, (channelMap.get(m.channel) || 0) + 1)
  }
  const topChannels = [...channelMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([channel, count]) => ({ channel, count }))

  return { total: memMoments.length, clipped, topChannels }
}

export async function getClippedMoments(limit: number = 20, offset: number = 0): Promise<Moment[]> {
  if (db) {
    const rows = await db.select().from(momentsTable)
      .where(sql`clip_url IS NOT NULL`)
      .orderBy(desc(momentsTable.id))
      .limit(limit)
      .offset(offset)
    return rows.map(rowToMoment)
  }
  return memMoments
    .filter(m => m.clipUrl)
    .reverse()
    .slice(offset, offset + limit)
}

function rowToMoment(r: any): Moment {
  return {
    id: r.id,
    channel: r.channel,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
    spikeAt: Number(r.spikeAt),
    clipStart: r.clipStart, clipEnd: r.clipEnd,
    clipStartUrl: r.clipStartUrl, clipEndUrl: r.clipEndUrl,
    vodTimestamp: r.vodTimestamp, vodUrl: r.vodUrl,
    jumpPercent: r.jumpPercent,
    burst: r.burst, baseline: r.baseline,
    mood: r.mood, description: r.description,
    vibe: r.vibe, vibeIntensity: r.vibeIntensity,
    clipWorthy: r.clipWorthy ?? false,
    clipUrl: r.clipUrl, clipId: r.clipId,
    chatSnapshot: (r.chatSnapshot as string[]) || [],
  }
}
