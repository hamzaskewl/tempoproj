import type { DashboardMoment, Vibe } from './types'

interface DbMoment {
  id: number
  channel: string
  jumpPercent: number
  vibe: Vibe
  mood?: string | null
  description?: string | null
  chatSnapshot?: string[]
  clipUrl?: string | null
  clipId?: string | null
  vodUrl?: string | null
  vodTimestamp?: string | null
  spikeAt: number
}

export function mergeMoments(
  current: DashboardMoment[],
  fromDb: DbMoment[]
): DashboardMoment[] {
  const list = [...current]
  for (const m of fromDb) {
    if (list.some((s) => s.dbId === m.id)) continue
    list.push({
      id: `db-${m.id}`,
      dbId: m.id,
      channel: m.channel,
      jumpPercent: m.jumpPercent,
      viewers: null,
      vibe: m.vibe,
      mood: m.mood ?? null,
      description: m.description ?? null,
      chatSnapshot: m.chatSnapshot || [],
      clipUrl: m.clipUrl ?? null,
      clipId: m.clipId ?? null,
      vodUrl: m.vodUrl ?? null,
      vodTimestamp: m.vodTimestamp ?? null,
      receivedAt: m.spikeAt,
    })
  }

  // Dedupe by dbId or channel + 60s proximity
  const seen: DashboardMoment[] = []
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]
    const dupe = seen.find(
      (x) =>
        (s.dbId && x.dbId && s.dbId === x.dbId) ||
        (x.channel === s.channel && Math.abs(x.receivedAt - s.receivedAt) < 60_000)
    )
    if (dupe) {
      const sHasMore = !!(s.mood || s.clipUrl || s.dbId)
      const dupeHasNone = !dupe.mood && !dupe.clipUrl && !dupe.dbId
      if (sHasMore && dupeHasNone) {
        const idx = list.indexOf(dupe)
        if (idx > -1) list.splice(idx, 1)
        seen.push(s)
      } else {
        if (s.dbId && !dupe.dbId) dupe.dbId = s.dbId
        list.splice(i, 1)
      }
    } else {
      seen.push(s)
    }
  }

  list.sort((a, b) => b.receivedAt - a.receivedAt)
  return list
}
