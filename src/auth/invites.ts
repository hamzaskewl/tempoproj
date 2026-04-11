import crypto from 'crypto'
import { db } from '../db/index.js'
import { inviteCodes as inviteCodesTable, inviteCodeUses as inviteCodeUsesTable, whitelist as whitelistTable } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'

// --- Types ---
export interface InviteCode {
  code: string
  createdBy: string
  createdAt: number
  maxUses: number
  useCount: number
  label: string
  uses: InviteCodeUse[]
}

export interface InviteCodeUse {
  usedBy: string
  usedByName: string
  usedAt: number
}

// --- In-memory fallback stores ---
export const memInviteCodes = new Map<string, InviteCode>()
const memWhitelist = new Set<string>()

// --- Invite Codes ---

export async function generateInviteCode(createdBy: string, label: string = '', maxUses: number = 1): Promise<InviteCode> {
  const code = crypto.randomBytes(8).toString('hex')
  const now = Date.now()
  const invite: InviteCode = {
    code, createdBy, createdAt: now, maxUses, useCount: 0, label, uses: [],
  }

  if (db) {
    await db.insert(inviteCodesTable).values({
      code, createdBy, label, maxUses, useCount: 0,
    })
  }
  memInviteCodes.set(code, invite)
  console.log(`[auth] Invite code generated: ${code} by ${createdBy} (maxUses: ${maxUses})`)
  return invite
}

export async function validateInviteCode(code: string): Promise<boolean> {
  if (db) {
    const rows = await db.select().from(inviteCodesTable).where(eq(inviteCodesTable.code, code))
    if (rows.length === 0) return false
    return rows[0].useCount < rows[0].maxUses
  }
  const invite = memInviteCodes.get(code)
  return !!invite && invite.useCount < invite.maxUses
}

export async function redeemInviteCode(code: string, userId: string, username: string): Promise<boolean> {
  if (db) {
    const rows = await db.select().from(inviteCodesTable).where(eq(inviteCodesTable.code, code))
    if (rows.length === 0 || rows[0].useCount >= rows[0].maxUses) return false
    await db.update(inviteCodesTable)
      .set({ useCount: rows[0].useCount + 1 })
      .where(eq(inviteCodesTable.code, code))
    await db.insert(inviteCodeUsesTable).values({
      code, usedBy: userId, usedByName: username,
    })
    return true
  }
  const invite = memInviteCodes.get(code)
  if (!invite || invite.useCount >= invite.maxUses) return false
  invite.useCount++
  invite.uses.push({ usedBy: userId, usedByName: username, usedAt: Date.now() })
  return true
}

export async function getInviteCodes(): Promise<InviteCode[]> {
  if (db) {
    const rows = await db.select().from(inviteCodesTable).orderBy(desc(inviteCodesTable.createdAt))
    const useRows = await db.select().from(inviteCodeUsesTable)
    const usesByCode = new Map<string, InviteCodeUse[]>()
    for (const u of useRows) {
      const list = usesByCode.get(u.code) || []
      list.push({ usedBy: u.usedBy, usedByName: u.usedByName, usedAt: u.usedAt.getTime() })
      usesByCode.set(u.code, list)
    }
    return rows.map(r => ({
      code: r.code,
      createdBy: r.createdBy,
      createdAt: r.createdAt.getTime(),
      maxUses: r.maxUses,
      useCount: r.useCount,
      label: r.label || '',
      uses: usesByCode.get(r.code) || [],
    }))
  }
  return [...memInviteCodes.values()].sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteInviteCode(code: string): Promise<boolean> {
  if (db) {
    await db.delete(inviteCodeUsesTable).where(eq(inviteCodeUsesTable.code, code))
    await db.delete(inviteCodesTable).where(eq(inviteCodesTable.code, code))
  }
  memInviteCodes.delete(code)
  console.log(`[auth] Invite code deleted: ${code}`)
  return true
}

// --- Whitelist ---

export async function addToWhitelist(username: string, addedBy: string): Promise<void> {
  const u = username.toLowerCase()
  memWhitelist.add(u)
  if (db) {
    await db.insert(whitelistTable).values({ username: u, addedBy }).onConflictDoNothing()
  }
  console.log(`[auth] Whitelisted: ${u} by ${addedBy}`)
}

export async function removeFromWhitelist(username: string): Promise<void> {
  const u = username.toLowerCase()
  memWhitelist.delete(u)
  if (db) {
    await db.delete(whitelistTable).where(eq(whitelistTable.username, u))
  }
  console.log(`[auth] Removed from whitelist: ${u}`)
}

export async function getWhitelist(): Promise<{ username: string; addedBy: string; addedAt: number }[]> {
  if (db) {
    const rows = await db.select().from(whitelistTable).orderBy(desc(whitelistTable.addedAt))
    return rows.map(r => ({ username: r.username, addedBy: r.addedBy, addedAt: r.addedAt.getTime() }))
  }
  return [...memWhitelist].map(u => ({ username: u, addedBy: 'admin', addedAt: Date.now() }))
}

export function isWhitelisted(username: string): boolean {
  return memWhitelist.has(username.toLowerCase())
}

export async function loadWhitelist(): Promise<void> {
  if (db) {
    const rows = await db.select().from(whitelistTable)
    for (const r of rows) memWhitelist.add(r.username)
    if (rows.length > 0) console.log(`[auth] Loaded ${rows.length} whitelisted users`)
  }
}
