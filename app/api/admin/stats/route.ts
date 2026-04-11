import { requireAdmin } from '@/src/middleware-helpers'
import { getAuthStats } from '@/src/auth'
import { getLLMBudget } from '@/src/summarize'
import { getStats } from '@/src/firehose'

export async function GET(request: Request) {
  const user = await requireAdmin(request)
  if (user instanceof Response) return user
  const auth = await getAuthStats()
  const llm = getLLMBudget()
  const system = getStats()
  return Response.json({ auth, llm, system })
}
