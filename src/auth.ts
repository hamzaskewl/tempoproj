import crypto from 'crypto'
import { db } from './db/index.js'
import { users as usersTable, inviteCodes as inviteCodesTable, sessions as sessionsTable } from './db/schema.js'
import { eq, desc } from 'drizzle-orm'

// --- Types ---
export interface User {
  id: string
  username: string
  profileImage: string
  role: 'admin' | 'user'
  inviteCode: string
  createdAt: number
  lastSeen: number
}

export interface InviteCode {
  code: string
  createdBy: string
  createdAt: number
  usedBy: string | null
  usedByName: string | null
  usedAt: number | null
  label: string
}

export interface Session {
  token: string
  userId: string
  createdAt: number
  expiresAt: number
}

// --- In-memory fallback stores ---
const memUsers = new Map<string, User>()
const memSessions = new Map<string, Session>()
const memInviteCodes = new Map<string, InviteCode>()

// Rate limiting (always in-memory, ephemeral)
const rateLimits = new Map<string, { count: number; resetAt: number }>()

// Pending registrations (always in-memory, ephemeral)
interface PendingRegistration {
  token: string
  twitchId: string
  username: string
  profileImage: string
  twitchAccessToken: string
  createdAt: number
}
const pendingRegistrations = new Map<string, PendingRegistration>()
const PENDING_TTL = 10 * 60 * 1000

// --- Config ---
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000
const RATE_LIMIT_WINDOW = 60 * 1000
const RATE_LIMIT_MAX = 10
const ADMIN_TWITCH = (process.env.ADMIN_TWITCH || '').toLowerCase()

// --- Admin designation ---
export function isDesignatedAdmin(username: string): boolean {
  return !!ADMIN_TWITCH && username.toLowerCase() === ADMIN_TWITCH
}

// --- Invite Codes ---

export async function generateInviteCode(createdBy: string, label: string = ''): Promise<InviteCode> {
  const code = crypto.randomBytes(8).toString('hex')
  const now = Date.now()
  const invite: InviteCode = {
    code, createdBy, createdAt: now, usedBy: null, usedByName: null, usedAt: null, label,
  }

  if (db) {
    await db.insert(inviteCodesTable).values({
      code, createdBy, label, usedBy: null, usedByName: null, usedAt: null,
    })
  }
  memInviteCodes.set(code, invite)
  console.log(`[auth] Invite code generated: ${code} by ${createdBy}`)
  return invite
}

export async function validateInviteCode(code: string): Promise<boolean> {
  if (db) {
    const rows = await db.select().from(inviteCodesTable).where(eq(inviteCodesTable.code, code))
    return rows.length > 0 && rows[0].usedBy === null
  }
  const invite = memInviteCodes.get(code)
  return !!invite && invite.usedBy === null
}

export async function redeemInviteCode(code: string, userId: string, username: string): Promise<boolean> {
  if (db) {
    const rows = await db.select().from(inviteCodesTable).where(eq(inviteCodesTable.code, code))
    if (rows.length === 0 || rows[0].usedBy !== null) return false
    await db.update(inviteCodesTable)
      .set({ usedBy: userId, usedByName: username, usedAt: new Date() })
      .where(eq(inviteCodesTable.code, code))
    return true
  }
  const invite = memInviteCodes.get(code)
  if (!invite || invite.usedBy !== null) return false
  invite.usedBy = userId
  invite.usedByName = username
  invite.usedAt = Date.now()
  return true
}

export async function getInviteCodes(): Promise<InviteCode[]> {
  if (db) {
    const rows = await db.select().from(inviteCodesTable).orderBy(desc(inviteCodesTable.createdAt))
    return rows.map(r => ({
      code: r.code,
      createdBy: r.createdBy,
      createdAt: r.createdAt.getTime(),
      usedBy: r.usedBy,
      usedByName: r.usedByName,
      usedAt: r.usedAt?.getTime() || null,
      label: r.label || '',
    }))
  }
  return [...memInviteCodes.values()].sort((a, b) => b.createdAt - a.createdAt)
}

// --- Users ---

export async function createUser(twitchId: string, username: string, profileImage: string, inviteCode: string): Promise<User> {
  const role = isDesignatedAdmin(username) ? 'admin' : 'user'
  const now = Date.now()
  const user: User = {
    id: twitchId, username, profileImage, role: role as 'admin' | 'user',
    inviteCode, createdAt: now, lastSeen: now,
  }

  if (db) {
    await db.insert(usersTable).values({
      id: twitchId, username, profileImage, role, inviteCode,
    }).onConflictDoUpdate({
      target: usersTable.id,
      set: { username, profileImage, role, lastSeen: new Date() },
    })
  }
  memUsers.set(twitchId, user)
  console.log(`[auth] User created: ${username} (${twitchId}) role=${role}`)
  return user
}

export async function getUser(twitchId: string): Promise<User | null> {
  if (db) {
    const rows = await db.select().from(usersTable).where(eq(usersTable.id, twitchId))
    if (rows.length === 0) return null
    const r = rows[0]
    return {
      id: r.id, username: r.username, profileImage: r.profileImage || '',
      role: r.role as 'admin' | 'user', inviteCode: r.inviteCode,
      createdAt: r.createdAt.getTime(), lastSeen: r.lastSeen.getTime(),
    }
  }
  return memUsers.get(twitchId) || null
}

export async function getAllUsers(): Promise<User[]> {
  if (db) {
    const rows = await db.select().from(usersTable).orderBy(desc(usersTable.lastSeen))
    return rows.map(r => ({
      id: r.id, username: r.username, profileImage: r.profileImage || '',
      role: r.role as 'admin' | 'user', inviteCode: r.inviteCode,
      createdAt: r.createdAt.getTime(), lastSeen: r.lastSeen.getTime(),
    }))
  }
  return [...memUsers.values()].sort((a, b) => b.lastSeen - a.lastSeen)
}

export function isAdmin(twitchId: string): boolean {
  const user = memUsers.get(twitchId)
  return user?.role === 'admin'
}

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
      usedInvites: allInvites.filter(i => i.usedBy !== null).length,
      availableInvites: allInvites.filter(i => i.usedBy === null).length,
    }
  }
  return {
    totalUsers: memUsers.size,
    activeSessions: memSessions.size,
    totalInvites: memInviteCodes.size,
    usedInvites: [...memInviteCodes.values()].filter(i => i.usedBy !== null).length,
    availableInvites: [...memInviteCodes.values()].filter(i => i.usedBy === null).length,
  }
}

// Clean up expired sessions periodically
setInterval(async () => {
  const now = Date.now()
  // Clean in-memory
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
