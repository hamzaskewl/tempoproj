import { getTrending } from '@/src/firehose'

export async function GET() {
  return Response.json(getTrending(10))
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const limit = body?.limit || 20
  return Response.json(getTrending(limit))
}
