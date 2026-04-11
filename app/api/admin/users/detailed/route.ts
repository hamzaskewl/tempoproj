import { requireAdmin } from '@/src/middleware-helpers'
import { getAllUsers } from '@/src/auth'
import { db } from '@/src/db/index'
import { userChannels as userChannelsTable, moments as momentsTable, twitchTokens as twitchTokensTable } from '@/src/db/schema'
import { sql } from 'drizzle-orm'

export async function GET(request: Request) {
  const user = await requireAdmin(request)
  if (user instanceof Response) return user
  if (!db) return Response.json({ users: [] })

  try {
    const users = await getAllUsers()
    const allChannels = await db.select().from(userChannelsTable)
    const clipCounts = await db.select({
      userId: momentsTable.userId,
      total: sql<number>`count(*)`,
      clipped: sql<number>`count(clip_url)`,
    }).from(momentsTable).where(sql`user_id IS NOT NULL`).groupBy(momentsTable.userId)
    const tokens = await db.select({ userId: twitchTokensTable.userId, updatedAt: twitchTokensTable.updatedAt }).from(twitchTokensTable)
    const tokenMap = new Map(tokens.map(t => [t.userId, t.updatedAt]))
    const clipMap = new Map(clipCounts.map(c => [c.userId, { total: Number(c.total), clipped: Number(c.clipped) }]))

    const detailed = users.map(u => {
      const channels = allChannels.filter(c => c.userId === u.id).map(c => ({
        channel: c.channel, confirmed: c.confirmed, addedAt: c.addedAt.getTime(),
        confirmedAt: c.confirmedAt?.getTime() || null,
      }))
      const clips = clipMap.get(u.id) || { total: 0, clipped: 0 }
      return {
        ...u,
        channels,
        momentsTotal: clips.total,
        clipsCreated: clips.clipped,
        hasOAuth: tokenMap.has(u.id),
        oauthUpdatedAt: tokenMap.get(u.id)?.getTime() || null,
      }
    })
    return Response.json({ users: detailed })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
