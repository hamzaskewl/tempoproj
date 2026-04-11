import { getTrending } from '@/src/firehose'
import { mppx } from '@/src/mpp'

export async function GET() {
  return Response.json(getTrending(10))
}

export const POST = mppx.charge({ amount: '0.001', description: 'Trending channels query' })(
  async (request: Request) => {
    const body = await request.json()
    const limit = body?.limit || 20
    return Response.json(getTrending(limit))
  }
)
