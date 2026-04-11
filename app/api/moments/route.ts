import { mppx } from '@/src/mpp'
import { getMoments } from '@/src/moments'

export const POST = mppx.charge({ amount: '0.001', description: 'Captured moments query' })(
  async (request: Request) => {
    const { channel, clipWorthyOnly, limit } = await request.json().catch(() => ({}))
    const result = await getMoments({ channel, clipWorthyOnly, limit: limit || 20 })
    return Response.json({ moments: result, count: result.length })
  }
)
