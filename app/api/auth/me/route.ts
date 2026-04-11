import { getAuthUser } from '@/src/middleware-helpers'

export async function GET(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return Response.json({ authenticated: false })
  return Response.json({
    authenticated: true,
    user: { id: user.id, username: user.username, profileImage: user.profileImage, role: user.role },
  })
}
