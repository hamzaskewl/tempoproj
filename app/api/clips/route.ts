import { getClippedMoments, getClippedMomentsCount, getMomentStats } from '@/src/moments'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50)
  const offset = parseInt(url.searchParams.get('offset') || '0')
  const channel = url.searchParams.get('channel') || undefined
  const clips = await getClippedMoments(limit, offset, channel)
  const stats = await getMomentStats()
  const filteredTotal = await getClippedMomentsCount(channel)
  return Response.json({ clips, stats, filteredTotal })
}
