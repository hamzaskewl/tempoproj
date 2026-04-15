import { getStats, isConnected } from '@/src/firehose'
import { ensureStarted } from '@/lib/server-init'

export async function GET() {
  ensureStarted()
  const stats = getStats()
  return Response.json({ ok: true, ...stats, connected: isConnected() })
}
