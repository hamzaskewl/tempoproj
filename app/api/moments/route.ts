import { getMoments } from '@/src/moments'

export async function POST(request: Request) {
  const { channel, clipWorthyOnly, limit } = await request.json().catch(() => ({}))
  const result = await getMoments({ channel, clipWorthyOnly, limit: limit || 20 })
  return Response.json({ moments: result, count: result.length })
}
