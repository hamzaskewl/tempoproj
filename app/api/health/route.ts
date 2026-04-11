import { getStats, isConnected } from '@/src/firehose'

export async function GET() {
  const stats = getStats()
  return Response.json({ ok: true, ...stats, connected: isConnected() })
}
