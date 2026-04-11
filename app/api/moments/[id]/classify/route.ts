import { requireAuth } from '@/src/middleware-helpers'
import { getMomentById } from '@/src/moments'
import { classifySpike, classifySpikeDirect, hasDirectAPI } from '@/src/summarize'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(request)
  if (user instanceof Response) return user

  const { id } = await params
  const moment = await getMomentById(parseInt(id))
  if (!moment) return Response.json({ error: 'Moment not found' }, { status: 404 })

  const classify = hasDirectAPI() ? classifySpikeDirect : classifySpike
  const result = await classify(moment.chatSnapshot)
  if (result) {
    moment.mood = result.mood
    moment.description = result.description
  }
  return Response.json({
    channel: moment.channel,
    jumpPercent: moment.jumpPercent,
    vibe: moment.vibe,
    mood: result?.mood,
    description: result?.description,
    chatSnapshot: moment.chatSnapshot.slice(0, 10),
  })
}
