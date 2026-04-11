import { setActiveChannel, removeActiveChannel, isStreamLive } from '../firehose/index.js'
import { loadChannelEmotes } from '../tokenizer/index.js'
import { db } from '../db/index.js'
import { watchedChannels as watchedTable, userChannels as userChannelsTable } from '../db/schema.js'
import { eq, and, sql } from 'drizzle-orm'

export interface UserChannel {
  id: number
  userId: string
  channel: string
  addedAt: number
  confirmed: boolean
  confirmedAt: number | null
}

// Watched channels (synced to DB) -- global system watchlist
export const watchedChannelsSet = new Set<string>()

// Per-user channels (in-memory cache)
export const memUserChannels = new Map<string, UserChannel[]>()

const MAX_USER_CHANNELS = 3

export async function initWatchedChannels() {
  if (db) {
    await db.delete(watchedTable)
    console.log(`[moments] Cleared stale watched_channels table`)
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
  const stillWatched = await isChannelWatchedByAnyone(ch)
  if (!stillWatched) {
    watchedChannelsSet.delete(ch)
    removeActiveChannel(ch)
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
  const live = await isStreamLive(ch)
  if (!live) return { ok: false, error: `${ch} is not currently live. You can only confirm live channels.` }
  if (db) {
    await db.update(userChannelsTable)
      .set({ confirmed: true, confirmedAt: new Date() })
      .where(and(eq(userChannelsTable.userId, userId), eq(userChannelsTable.channel, ch)))
  }
  const memList = memUserChannels.get(userId) || []
  const item = memList.find(c => c.channel === ch)
  if (item) { item.confirmed = true; item.confirmedAt = Date.now() }
  watchedChannelsSet.add(ch)
  setActiveChannel(ch)
  loadChannelEmotes(ch).catch(() => {})
  console.log(`[user-ch] ${userId} confirmed channel: ${ch} (now auto-clipping)`)
  return { ok: true }
}

// Find all user IDs who have this channel confirmed
export function getUsersForChannel(channel: string): string[] {
  const users: string[] = []
  for (const [userId, list] of memUserChannels) {
    if (list.some(c => c.channel === channel && c.confirmed)) users.push(userId)
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
