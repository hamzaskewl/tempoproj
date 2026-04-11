import { requireAdmin } from '@/src/middleware-helpers'
import { getLLMBudget } from '@/src/summarize'

export async function GET(request: Request) {
  const user = await requireAdmin(request)
  if (user instanceof Response) return user
  return Response.json(getLLMBudget())
}
