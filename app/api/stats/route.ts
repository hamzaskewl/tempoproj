import { getStats, getTrending } from '@/src/firehose'
import { getMomentStats } from '@/src/moments'

export async function GET() {
  const stats = getStats()
  const momentStats = await getMomentStats()
  const trending = getTrending(5)
  return Response.json({
    connected: stats.connected,
    totalChannels: stats.totalChannels,
    totalMsgsPerSec: stats.totalMsgsPerSec,
    moments: momentStats,
    trending: trending.channels || [],
  })
}
