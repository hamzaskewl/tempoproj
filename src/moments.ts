import { onSpike, getRecentMessages, getVodTimestamp, getVodUrl, setActiveChannel, removeActiveChannel, isStreamLive } from './firehose.js'
import { classifySpikeDirect, classifySpike, hasDirectAPI } from './summarize.js'
import { createClip, hasTwitchAuth } from './clip.js'
import { loadChannelEmotes } from './tokenizer.js'
import { db } from './db/index.js'
import { moments as momentsTable, watchedChannels as watchedTable, userChannels as userChannelsTable } from './db/schema.js'
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

export interface UserChannel {
  id: number
  userId: string
  channel: string
  addedAt: number
  confirmed: boolean
  confirmedAt: number | null
}

// In-memory cache for recent moments (fast reads)
const memMoments: Moment[] = []
let nextMemId = 1

// Watched channels (synced to DB) — global system watchlist
const watchedChannelsSet = new Set<string>()

// Per-user channels (in-memory cache)
const memUserChannels = new Map<string, UserChannel[]>()

const MAX_USER_CHANNELS = 3

export async function initWatchedChannels() {
  if (db) {
    // Clear stale global watched_channels — user_channels is the source of truth now
    await db.delete(watchedTable)
    console.log(`[moments] Cleared stale watched_channels table`)

    // Load user channels — only confirmed ones get activated
    const ucRows = await db.select().from(userChannelsTable)
    for (const r of ucRows) {
      const list = memUserChannels.get(r.userId) || []
      list.push({
        id: r.id, userId: r.userId, channel: r.channel,
        addedAt: r.addedAt.getTime(), confirmed: r.confirmed,
        confirmedAt: r.confirmedAt?.getTime() || null,
      })
      memUserChannels.set(r.userId, list)

      if (r.confirmed) {
        watchedChannelsSet.add(r.channel)
        setActiveChannel(r.channel)
      }
    }
    const confirmed = ucRows.filter(r => r.confirmed)
    if (confirmed.length > 0) {
      console.log(`[moments] Activated ${confirmed.length} confirmed user channels: ${confirmed.map(r => r.channel).join(', ')}`)
    }
    if (ucRows.length > 0) {
      console.log(`[moments] Loaded ${ucRows.length} user channel slots from DB`)
    }
  }
}

// --- Global watchlist (system-level, backwards compat) ---

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

// --- Per-user channel management ---

export async function getUserChannels(userId: string): Promise<UserChannel[]> {
  if (db) {
    const rows = await db.select().from(userChannelsTable).where(eq(userChannelsTable.userId, userId))
    return rows.map(r => ({
      id: r.id, userId: r.userId, channel: r.channel,
      addedAt: r.addedAt.getTime(), confirmed: r.confirmed,
      confirmedAt: r.confirmedAt?.getTime() || null,
    }))
  }
  return memUserChannels.get(userId) || []
}

export async function addUserChannel(userId: string, channel: string): Promise<{ ok: boolean; error?: string; channels?: UserChannel[] }> {
  const ch = channel.toLowerCase()

  const existing = await getUserChannels(userId)
  if (existing.length >= MAX_USER_CHANNELS) {
    return { ok: false, error: `Maximum ${MAX_USER_CHANNELS} channels allowed. Remove one first.` }
  }
  if (existing.some(c => c.channel === ch)) {
    return { ok: false, error: `Already watching ${ch}` }
  }

  const uc: UserChannel = {
    id: 0, userId, channel: ch,
    addedAt: Date.now(), confirmed: false, confirmedAt: null,
  }

  if (db) {
    const rows = await db.insert(userChannelsTable).values({
      userId, channel: ch, confirmed: false,
    }).returning({ id: userChannelsTable.id })
    uc.id = rows[0].id
  } else {
    uc.id = Date.now()
  }

  const list = memUserChannels.get(userId) || []
  list.push(uc)
  memUserChannels.set(userId, list)

  // Start tracking (but not auto-clipping until confirmed)
  setActiveChannel(ch)

  console.log(`[user-ch] ${userId} added channel: ${ch}`)
  return { ok: true, channels: await getUserChannels(userId) }
}

export async function removeUserChannel(userId: string, channel: string): Promise<{ ok: boolean; channels?: UserChannel[] }> {
  const ch = channel.toLowerCase()

  if (db) {
    await db.delete(userChannelsTable).where(
      and(eq(userChannelsTable.userId, userId), eq(userChannelsTable.channel, ch))
    )
  }

  const list = memUserChannels.get(userId) || []
  memUserChannels.set(userId, list.filter(c => c.channel !== ch))

  // Check if any other user still watches this channel
  const stillWatched = await isChannelWatchedByAnyone(ch)
  if (!stillWatched) {
    watchedChannelsSet.delete(ch)
    removeActiveChannel(ch)
    // Also clean from global watched_channels table if it was added there
    if (db) {
      await db.delete(watchedTable).where(eq(watchedTable.channel, ch)).catch(() => {})
    }
  }

  console.log(`[user-ch] ${userId} removed channel: ${ch}`)
  return { ok: true, channels: await getUserChannels(userId) }
}

export async function confirmUserChannel(userId: string, channel: string): Promise<{ ok: boolean; error?: string }> {
  const ch = channel.toLowerCase()
  const channels = await getUserChannels(userId)
  const uc = channels.find(c => c.channel === ch)
  if (!uc) return { ok: false, error: 'Channel not in your list' }

  // Check if stream is live
  const live = await isStreamLive(ch)
  if (!live) return { ok: false, error: `${ch} is not currently live. You can only confirm live channels.` }

  if (db) {
    await db.update(userChannelsTable)
      .set({ confirmed: true, confirmedAt: new Date() })
      .where(and(eq(userChannelsTable.userId, userId), eq(userChannelsTable.channel, ch)))
  }

  // Update in-memory
  const list = memUserChannels.get(userId) || []
  const item = list.find(c => c.channel === ch)
  if (item) {
    item.confirmed = true
    item.confirmedAt = Date.now()
  }

  // Activate for auto-clipping
  watchedChannelsSet.add(ch)
  setActiveChannel(ch)

  // Load 7TV/BTTV/FFZ emotes for this channel
  loadChannelEmotes(ch).catch(() => {})

  console.log(`[user-ch] ${userId} confirmed channel: ${ch} (now auto-clipping)`)
  return { ok: true }
}

// Find all user IDs who have this channel confirmed
function getUsersForChannel(channel: string): string[] {
  const users: string[] = []
  for (const [userId, list] of memUserChannels) {
    if (list.some(c => c.channel === channel && c.confirmed)) {
      users.push(userId)
    }
  }
  return users
}

async function isChannelWatchedByAnyone(channel: string): Promise<boolean> {
  if (db) {
    const rows = await db.select({ count: sql<number>`count(*)` })
      .from(userChannelsTable)
      .where(and(eq(userChannelsTable.channel, channel), eq(userChannelsTable.confirmed, true)))
    return Number(rows[0]?.count || 0) > 0
  }
  for (const list of memUserChannels.values()) {
    if (list.some(c => c.channel === channel && c.confirmed)) return true
  }
  return false
}

// --- Moment storage ---

async function saveMoment(moment: Moment): Promise<number> {
  if (db) {
    // Check for existing moment with same channel+spikeAt+userId (prevent dupes)
    const existing = await db.select({ id: momentsTable.id }).from(momentsTable)
      .where(and(
        eq(momentsTable.channel, moment.channel),
        eq(momentsTable.spikeAt, moment.spikeAt),
        moment.userId ? eq(momentsTable.userId, moment.userId) : sql`user_id IS NULL`
      ))
      .limit(1)
    if (existing.length > 0) {
      console.log(`[moments] Skipping duplicate: ${moment.channel} spikeAt=${moment.spikeAt} userId=${moment.userId}`)
      return existing[0].id
    }

    const rows = await db.insert(momentsTable).values({
      channel: moment.channel,
      userId: moment.userId,
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

    // Find which user(s) own this channel
    const ownerUsers = getUsersForChannel(spike.channel.toLowerCase())
    const primaryUserId = ownerUsers.length > 0 ? ownerUsers[0] : null

    const moment: Moment = {
      id: memId,
      channel: spike.channel,
      userId: primaryUserId,
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
        // Build streamer context for LLM
        const context = {
          streamer: spike.channel,
          game: (spike as any).game || null,
          streamTitle: (spike as any).streamTitle || null,
          viewers: spike.viewers || null,
        }

        // Use direct API if available, fallback to MPP
        const classify = hasDirectAPI() ? classifySpikeDirect : classifySpike
        const result = await classify(chatSnapshot, context)
        if (result) {
          moment.mood = result.mood
          moment.description = result.description
          moment.clipWorthy = result.clipWorthy
          console.log(`[moments] #${memId} LLM: ${result.mood} / clipWorthy=${result.clipWorthy} — "${result.description}"`)

          // Only create clips for moments the LLM deems clip-worthy
          if (result.clipWorthy && hasTwitchAuth()) {
            const clip = await createClip(spike.channel, primaryUserId || undefined)
            if (clip) {
              moment.clipUrl = clip.clipUrl
              moment.clipId = clip.clipId
              console.log(`[moments] #${memId} clipped: ${clip.clipUrl}`)
            }
          } else if (!result.clipWorthy) {
            console.log(`[moments] #${memId} skipped clipping — not clip-worthy`)
          }
        }
      } catch (err: any) {
        console.error(`[moments] #${memId} classify failed:`, err.message)
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

    // Save to DB — single row per spike (no per-user copies)
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

export async function getMomentsByUser(userId: string, limit: number = 50): Promise<Moment[]> {
  if (db) {
    // Show moments for channels the user is watching (confirmed), deduplicated
    const rows = await db.select().from(momentsTable)
      .where(sql`channel IN (SELECT channel FROM user_channels WHERE user_id = ${userId} AND confirmed = true) AND id IN (SELECT MIN(id) FROM moments GROUP BY channel, spike_at)`)
      .orderBy(desc(momentsTable.id))
      .limit(limit)
    return rows.map(rowToMoment)
  }
  // In-memory fallback: match by user's channels
  const userChs = memUserChannels.get(userId) || []
  const confirmedChs = new Set(userChs.filter(c => c.confirmed).map(c => c.channel))
  return memMoments
    .filter(m => confirmedChs.has(m.channel.toLowerCase()))
    .reverse()
    .slice(0, limit)
}

export async function getMoments(options?: { channel?: string; clipWorthyOnly?: boolean; limit?: number; offset?: number }): Promise<Moment[]> {
  if (db) {
    // Deduplicate by channel+spikeAt — pick the row with the lowest id per unique spike
    let whereClause = sql`id IN (SELECT MIN(id) FROM moments GROUP BY channel, spike_at)`

    if (options?.channel) {
      whereClause = sql`${whereClause} AND channel = ${options.channel.toLowerCase()}`
    }
    if (options?.clipWorthyOnly) {
      whereClause = sql`${whereClause} AND clip_worthy = true`
    }

    const rows = await db.select().from(momentsTable)
      .where(whereClause)
      .orderBy(desc(momentsTable.id))
      .limit(options?.limit || 20)
      .offset(options?.offset || 0)
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

export async function getClippedMoments(limit: number = 20, offset: number = 0, channel?: string): Promise<Moment[]> {
  if (db) {
    let whereClause = sql`clip_url IS NOT NULL AND id IN (SELECT MIN(id) FROM moments WHERE clip_url IS NOT NULL GROUP BY channel, spike_at)`
    if (channel) {
      whereClause = sql`${whereClause} AND channel = ${channel.toLowerCase()}`
    }
    const rows = await db.select().from(momentsTable)
      .where(whereClause)
      .orderBy(desc(momentsTable.id))
      .limit(limit)
      .offset(offset)
    return rows.map(rowToMoment)
  }
  let result = memMoments.filter(m => m.clipUrl)
  if (channel) result = result.filter(m => m.channel.toLowerCase() === channel.toLowerCase())
  return result.reverse().slice(offset, offset + limit)
}

export async function getClippedMomentsCount(channel?: string): Promise<number> {
  if (db) {
    let whereClause = sql`clip_url IS NOT NULL AND id IN (SELECT MIN(id) FROM moments WHERE clip_url IS NOT NULL GROUP BY channel, spike_at)`
    if (channel) {
      whereClause = sql`${whereClause} AND channel = ${channel.toLowerCase()}`
    }
    const rows = await db.select({ count: sql<number>`count(*)` }).from(momentsTable).where(whereClause)
    return Number(rows[0]?.count || 0)
  }
  let result = memMoments.filter(m => m.clipUrl)
  if (channel) result = result.filter(m => m.channel.toLowerCase() === channel.toLowerCase())
  return result.length
}

function rowToMoment(r: any): Moment {
  return {
    id: r.id,
    channel: r.channel,
    userId: r.userId || null,
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
