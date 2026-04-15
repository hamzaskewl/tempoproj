import { db } from '../db/index'
import { users as usersTable, sessions as sessionsTable } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { memSessions } from './sessions'

// --- Types ---
export interface User {
  id: string
  username: string
  profileImage: string
  role: 'admin' | 'user'
  inviteCode: string
  createdAt: number
  lastSeen: number
  tosAcceptedAt: number | null
}

// --- In-memory fallback store ---
export const memUsers = new Map<string, User>()

// --- Config ---
export const ADMIN_TWITCH = (process.env.ADMIN_TWITCH || '').toLowerCase()

// --- Admin designation ---
export function isDesignatedAdmin(username: string): boolean {
  return !!ADMIN_TWITCH && username.toLowerCase() === ADMIN_TWITCH
}

// --- Users ---

export async function createUser(twitchId: string, username: string, profileImage: string, inviteCode: string, tosAccepted: boolean = false): Promise<User> {
  const role = isDesignatedAdmin(username) ? 'admin' : 'user'
  const now = Date.now()
  const user: User = {
    id: twitchId, username, profileImage, role: role as 'admin' | 'user',
    inviteCode, createdAt: now, lastSeen: now,
    tosAcceptedAt: tosAccepted ? now : null,
  }

  if (db) {
    await db.insert(usersTable).values({
      id: twitchId, username, profileImage, role, inviteCode,
      tosAcceptedAt: tosAccepted ? new Date() : null,
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
      tosAcceptedAt: r.tosAcceptedAt?.getTime() || null,
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
      tosAcceptedAt: r.tosAcceptedAt?.getTime() || null,
    }))
  }
  return [...memUsers.values()].sort((a, b) => b.lastSeen - a.lastSeen)
}

export function isAdmin(twitchId: string): boolean {
  const user = memUsers.get(twitchId)
  return user?.role === 'admin'
}

// --- Delete user (revoke access) ---

export async function deleteUser(userId: string): Promise<boolean> {
  if (db) {
    await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId))
    await db.delete(usersTable).where(eq(usersTable.id, userId))
  }
  // Clean in-memory
  memUsers.delete(userId)
  for (const [token, session] of memSessions) {
    if (session.userId === userId) memSessions.delete(token)
  }
  console.log(`[auth] User deleted: ${userId}`)
  return true
}
