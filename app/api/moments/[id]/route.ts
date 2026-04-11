import { getMomentById } from '@/src/moments'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = parseInt(id)
  const moment = await getMomentById(numId)
  if (!moment) return Response.json({ error: `Moment #${numId} not found` }, { status: 404 })
  return Response.json(moment)
}
