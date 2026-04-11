import crypto from 'crypto'
import { db } from '../db/index.js'
import { users as usersTable, sessions as sessionsTable, inviteCodes as inviteCodesTable } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { getUser, memUsers } from './users.js'
import type { User } from './users.js'

// --- Types ---
export interface Session {
  token: string
  userId: string
  createdAt: number
  expiresAt: number
}

interface PendingRegistration {
  token: string
  twitchId: string
  username: string
  profileImage: string
  twitchAccessToken: string
  createdAt: number
}

// --- In-memory stores ---
export const memSessions = new Map<string, Session>()
const rateLimits = new Map<string, { count: number; resetAt: number }>()
const pendingRegistrations = new Map<string, PendingRegistration>()

// --- Config ---
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000
const RATE_LIMIT_WINDOW = 60 * 1000
const RATE_LIMIT_MAX = 10
const PENDING_TTL = 10 * 60 * 1000

// --- Sessions ---

export async function createSession(userId: string): Promise<Session> {
  const token = crypto.randomBytes(32).toString('hex')
  const now = Date.now()
  const session: Session = {
    token, userId, createdAt: now, expiresAt: now + SESSION_TTL,
  }

  if (db) {
    await db.insert(sessionsTable).values({
      token, userId, expiresAt: new Date(now + SESSION_TTL),
    })
    // Update last seen
    await db.update(usersTable).set({ lastSeen: new Date() }).where(eq(usersTable.id, userId))
  }
  memSessions.set(token, session)
  const user = memUsers.get(userId)
  if (user) user.lastSeen = now

  return session
}

export async function validateSession(token: string): Promise<User | null> {
  if (db) {
    const rows = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token))
    if (rows.length === 0) return null
    const s = rows[0]
    if (new Date() > s.expiresAt) {
      await db.delete(sessionsTable).where(eq(sessionsTable.token, token))
      return null
    }
    const user = await getUser(s.userId)
    if (user) {
      await db.update(usersTable).set({ lastSeen: new Date() }).where(eq(usersTable.id, s.userId))
    }
    return user
  }

  const session = memSessions.get(token)
  if (!session) return null
  if (Date.now() > session.expiresAt) {
    memSessions.delete(token)
    return null
  }
  const user = memUsers.get(session.userId)
  if (user) user.lastSeen = Date.now()
  return user || null
}

export async function destroySession(token: string) {
  if (db) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token))
  }
  memSessions.delete(token)
}

// --- Pending Registrations (always in-memory) ---

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
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

// --- Cookie helpers ---

export function getSessionCookie(token: string, secure: boolean): string {
  const parts = [
    `clippy_session=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${SESSION_TTL / 1000}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [
    'clippy_session=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0',
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

export async function getAuthStats() {
  if (db) {
    const allUsers = await db.select().from(usersTable)
    const allInvites = await db.select().from(inviteCodesTable)
    const allSessions = await db.select().from(sessionsTable)
    return {
      totalUsers: allUsers.length,
      activeSessions: allSessions.filter(s => new Date() < s.expiresAt).length,
      totalInvites: allInvites.length,
      usedInvites: allInvites.filter(i => i.useCount >= i.maxUses).length,
      availableInvites: allInvites.filter(i => i.useCount < i.maxUses).length,
    }
  }
  // Import memInviteCodes lazily to avoid circular dependency at load time
  const { memInviteCodes } = await import('./invites.js')
  return {
    totalUsers: memUsers.size,
    activeSessions: memSessions.size,
    totalInvites: memInviteCodes.size,
    usedInvites: [...memInviteCodes.values()].filter(i => i.useCount >= i.maxUses).length,
    availableInvites: [...memInviteCodes.values()].filter(i => i.useCount < i.maxUses).length,
  }
}

// Clean up expired sessions periodically
setInterval(async () => {
  const now = Date.now()
  for (const [token, session] of memSessions) {
    if (now > session.expiresAt) memSessions.delete(token)
  }
  for (const [ip, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(ip)
  }
  for (const [token, pending] of pendingRegistrations) {
    if (now - pending.createdAt > PENDING_TTL) pendingRegistrations.delete(token)
  }
}, 60_000)
