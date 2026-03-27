import crypto from 'crypto'

// --- Types ---
export interface User {
  id: string           // Twitch user ID
  username: string     // Twitch display name
  profileImage: string
  role: 'admin' | 'user'
  inviteCode: string   // Code they used to register
  createdAt: number
  lastSeen: number
}

export interface InviteCode {
  code: string
  createdBy: string    // Twitch user ID of admin who created it
  createdAt: number
  usedBy: string | null
  usedAt: number | null
  label: string        // optional description
}

export interface Session {
  token: string
  userId: string
  createdAt: number
  expiresAt: number
}

// --- In-memory stores ---
const users = new Map<string, User>()
const sessions = new Map<string, Session>()
const inviteCodes = new Map<string, InviteCode>()

// Rate limiting: track attempts per IP
const rateLimits = new Map<string, { count: number; resetAt: number }>()

// --- Config ---
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days
const RATE_LIMIT_WINDOW = 60 * 1000          // 1 minute
const RATE_LIMIT_MAX = 10                    // 10 attempts per minute

// --- Invite Codes ---

export function generateInviteCode(createdBy: string, label: string = ''): InviteCode {
  const code = crypto.randomBytes(8).toString('hex') // 16 hex chars
  const invite: InviteCode = {
    code,
    createdBy,
    createdAt: Date.now(),
    usedBy: null,
    usedAt: null,
    label,
  }
  inviteCodes.set(code, invite)
  console.log(`[auth] Invite code generated: ${code} by ${createdBy}`)
  return invite
}

export function validateInviteCode(code: string): boolean {
  const invite = inviteCodes.get(code)
  return !!invite && invite.usedBy === null
}

export function redeemInviteCode(code: string, userId: string): boolean {
  const invite = inviteCodes.get(code)
  if (!invite || invite.usedBy !== null) return false
  invite.usedBy = userId
  invite.usedAt = Date.now()
  return true
}

export function getInviteCodes() {
  return [...inviteCodes.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(i => ({
      ...i,
      usedByName: i.usedBy ? (users.get(i.usedBy)?.username || i.usedBy) : null,
    }))
}

// --- Admin designation via env var ---
const ADMIN_TWITCH = (process.env.ADMIN_TWITCH || '').toLowerCase()

export function isDesignatedAdmin(username: string): boolean {
  return !!ADMIN_TWITCH && username.toLowerCase() === ADMIN_TWITCH
}

// --- Users ---

export function createUser(twitchId: string, username: string, profileImage: string, inviteCode: string): User {
  const user: User = {
    id: twitchId,
    username,
    profileImage,
    role: isDesignatedAdmin(username) ? 'admin' : 'user',
    inviteCode,
    createdAt: Date.now(),
    lastSeen: Date.now(),
  }
  users.set(twitchId, user)
  console.log(`[auth] User created: ${username} (${twitchId}) role=${user.role}`)
  return user
}

export function getUser(twitchId: string): User | null {
  return users.get(twitchId) || null
}

export function getAllUsers(): User[] {
  return [...users.values()].sort((a, b) => b.lastSeen - a.lastSeen)
}

export function isAdmin(twitchId: string): boolean {
  return users.get(twitchId)?.role === 'admin'
}

// --- Sessions ---

export function createSession(userId: string): Session {
  const token = crypto.randomBytes(32).toString('hex')
  const session: Session = {
    token,
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL,
  }
  sessions.set(token, session)

  // Update last seen
  const user = users.get(userId)
  if (user) user.lastSeen = Date.now()

  return session
}

export function validateSession(token: string): User | null {
  const session = sessions.get(token)
  if (!session) return null
  if (Date.now() > session.expiresAt) {
    sessions.delete(token)
    return null
  }
  const user = users.get(session.userId)
  if (user) user.lastSeen = Date.now()
  return user || null
}

export function destroySession(token: string) {
  sessions.delete(token)
}

// --- Pending registrations (awaiting invite code) ---
interface PendingRegistration {
  token: string
  twitchId: string
  username: string
  profileImage: string
  twitchAccessToken: string
  createdAt: number
}

const pendingRegistrations = new Map<string, PendingRegistration>()
const PENDING_TTL = 10 * 60 * 1000 // 10 minutes

export function createPendingRegistration(twitchId: string, username: string, profileImage: string, twitchAccessToken: string): PendingRegistration {
  const token = crypto.randomBytes(16).toString('hex')
  const pending: PendingRegistration = { token, twitchId, username, profileImage, twitchAccessToken, createdAt: Date.now() }
  pendingRegistrations.set(token, pending)
  return pending
}

export function getPendingRegistration(token: string): PendingRegistration | null {
  const pending = pendingRegistrations.get(token)
  if (!pending) return null
  if (Date.now() - pending.createdAt > PENDING_TTL) {
    pendingRegistrations.delete(token)
    return null
  }
  return pending
}

export function consumePendingRegistration(token: string): PendingRegistration | null {
  const pending = getPendingRegistration(token)
  if (pending) pendingRegistrations.delete(token)
  return pending
}

// --- Rate Limiting ---

export function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimits.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }

  entry.count++
  return true
}

// --- Cookie helpers ---

export function getSessionCookie(token: string, secure: boolean): string {
  const parts = [
    `clippy_session=${token}`,
    'Path=/',
    'HttpOnly',
    `SameSite=Lax`,
    `Max-Age=${SESSION_TTL / 1000}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [
    'clippy_session=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function parseSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(/clippy_session=([a-f0-9]{64})/)
  return match ? match[1] : null
}

// --- Stats ---

export function getAuthStats() {
  return {
    totalUsers: users.size,
    activeSessions: sessions.size,
    totalInvites: inviteCodes.size,
    usedInvites: [...inviteCodes.values()].filter(i => i.usedBy !== null).length,
    availableInvites: [...inviteCodes.values()].filter(i => i.usedBy === null).length,
  }
}

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now()
  for (const [token, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(token)
  }
  // Clean up old rate limit entries
  for (const [ip, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(ip)
  }
}, 60_000)
