'use client'

import { useCallback, useEffect, useState } from 'react'
import { Topbar } from '@/components/Topbar'
import { AuthGuard } from '@/components/AuthGuard'
import { StatCard } from '@/components/StatCard'
import { RoleBadge } from './components/RoleBadge'
import { Th } from '@/components/TableHeader'
import { AdminInvites } from './components/AdminInvites'
import { AdminUsers } from './components/AdminUsers'
import { AdminWhitelist } from './components/AdminWhitelist'
import { getJSON, postJSON, deleteJSON } from '@/lib/api'
import { timeAgoLong } from '@/lib/format'
import type { AdminStats, InviteCode, AdminUser, DetailedUser, WhitelistEntry } from '@/lib/types'

export default function AdminPage() {
  return (
    <AuthGuard role="admin">
      <AdminInner />
    </AuthGuard>
  )
}

function AdminInner() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([])
  const [detailedUsers, setDetailedUsers] = useState<DetailedUser[]>([])
  const [whitelistInput, setWhitelistInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'clips-desc' | 'clips-asc' | 'moments-desc' | 'last-seen' | 'joined' | 'channels-desc'>('clips-desc')
  const [filter, setFilter] = useState<'all' | 'has-oauth' | 'no-oauth' | 'has-clips' | 'no-clips' | 'has-channels'>('all')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const loadStats = useCallback(async () => { try { setStats(await getJSON<AdminStats>('/admin/stats')) } catch {} }, [])
  const loadInvites = useCallback(async () => { try { const d = await getJSON<{ invites: InviteCode[] }>('/admin/invites'); setInvites(d.invites || []) } catch {} }, [])
  const loadUsers = useCallback(async () => { try { const d = await getJSON<{ users: AdminUser[] }>('/admin/users'); setUsers(d.users || []) } catch {} }, [])
  const loadWhitelist = useCallback(async () => { try { const d = await getJSON<{ whitelist: WhitelistEntry[] }>('/admin/whitelist'); setWhitelist(d.whitelist || []) } catch {} }, [])
  const loadDetailed = useCallback(async () => { try { const d = await getJSON<{ users: DetailedUser[] }>('/admin/users/detailed'); setDetailedUsers(d.users || []) } catch {} }, [])

  useEffect(() => {
    loadStats(); loadInvites(); loadUsers(); loadWhitelist(); loadDetailed()
    const id = setInterval(loadStats, 10000)
    return () => clearInterval(id)
  }, [loadStats, loadInvites, loadUsers, loadWhitelist, loadDetailed])

  async function handleCreateInvite(label: string, maxUses: number) {
    try {
      await postJSON('/admin/invite', { label, maxUses })
      await Promise.all([loadInvites(), loadStats()])
    } catch {}
  }

  async function handleDeleteInvite(code: string) {
    if (!confirm(`Delete invite code ${code}?`)) return
    try { await deleteJSON(`/admin/invites/${code}`); await Promise.all([loadInvites(), loadStats()]) } catch {}
  }

  async function handleDeleteUser(id: string, username: string) {
    if (!confirm(`Revoke access for ${username}? This deletes their account and all sessions.`)) return
    try { await deleteJSON(`/admin/users/${id}`); await Promise.all([loadUsers(), loadDetailed(), loadStats()]) } catch {}
  }

  async function handleRevokeToken(id: string, username: string) {
    if (!confirm(`Revoke OAuth token for ${username}? They will need to re-login to create clips.`)) return
    try { await deleteJSON(`/admin/users/${id}/token`); await loadDetailed() } catch {}
  }

  async function handleAddWhitelist() {
    const username = whitelistInput.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    setWhitelistInput('')
    if (!username) return
    try { await postJSON('/admin/whitelist', { username }); await loadWhitelist() } catch {}
  }

  async function handleRemoveWhitelist(username: string) {
    try { await deleteJSON(`/admin/whitelist/${username}`); await loadWhitelist() } catch {}
  }

  const budgetPct = stats ? Math.min(100, (stats.llm.spent / stats.llm.limit) * 100) : 0
  const budgetColor = budgetPct > 80 ? 'bg-[#ef4444]' : budgetPct > 50 ? 'bg-gradient-to-r from-[#f59e0b] to-[#ef4444]' : 'bg-gradient-to-r from-[#22c55e] to-[#f59e0b]'

  return (
    <>
      <Topbar showLogout />
      <div className="max-w-[1400px] mx-auto p-4 md:p-8">
        <div className="text-[13px] uppercase tracking-[2px] text-[#444] mb-6">admin panel</div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatCard val={stats?.auth.totalUsers ?? '-'} label="users" />
          <StatCard val={stats?.auth.availableInvites ?? '-'} label="invites available" />
          <StatCard val={stats?.system.totalChannels?.toLocaleString() ?? '-'} label="channels" />
          <StatCard val={stats?.system.totalMsgsPerSec?.toFixed(0) ?? '-'} label="msg/s" />
          <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-5">
            <div className="text-[32px] font-bold text-white">${stats?.llm.spent.toFixed(4) ?? '-'}</div>
            <div className="text-[12px] uppercase tracking-wider text-[#444] mt-1">LLM spent</div>
            <div className="text-[13px] text-[#333] mt-[3px]">
              {stats && `$${stats.llm.remaining.toFixed(2)} / $${stats.llm.limit} remaining`}
            </div>
            <div className="w-full h-2 bg-[#1a1a1a] rounded mt-3 overflow-hidden">
              <div className={`h-full rounded transition-all ${budgetColor}`} style={{ width: `${budgetPct}%` }} />
            </div>
          </div>
          <StatCard val={stats?.llm.totalCalls ?? '-'} label="LLM calls" />
        </div>

        {/* Invites + Basic users */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <AdminInvites
            invites={invites}
            onCreateInvite={handleCreateInvite}
            onDeleteInvite={handleDeleteInvite}
            copiedCode={copiedCode}
            setCopiedCode={setCopiedCode}
          />

          {/* Basic users table */}
          <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-6">
            <div className="text-[12px] uppercase tracking-wider text-[#555] mb-4">users</div>
            <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr>
                    <Th>user</Th>
                    <Th>role</Th>
                    <Th>last seen</Th>
                    <Th>joined</Th>
                    <Th>{''}</Th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-[#222] text-center p-6">no users yet</td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-[#0e0e0e]">
                        <td className="py-[12px] px-3 border-b border-[#111] text-white">{u.username}</td>
                        <td className="py-[12px] px-3 border-b border-[#111]"><RoleBadge role={u.role} /></td>
                        <td className="py-[12px] px-3 border-b border-[#111] text-[#999]">{timeAgoLong(u.lastSeen)}</td>
                        <td className="py-[12px] px-3 border-b border-[#111] text-[#999]">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="py-[12px] px-3 border-b border-[#111]">
                          {u.role !== 'admin' && (
                            <button onClick={() => handleDeleteUser(u.id, u.username)} className="border border-[#ef444444] text-[#ef4444] rounded text-[12px] px-2 py-[2px] hover:bg-[#1a0a0a]">revoke</button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detailed users */}
        <AdminUsers
          detailedUsers={detailedUsers}
          search={search}
          setSearch={setSearch}
          sort={sort}
          setSort={setSort}
          filter={filter}
          setFilter={setFilter}
          onDeleteUser={handleDeleteUser}
          onRevokeToken={handleRevokeToken}
        />

        {/* Whitelist */}
        <AdminWhitelist
          whitelist={whitelist}
          whitelistInput={whitelistInput}
          setWhitelistInput={setWhitelistInput}
          onAddWhitelist={handleAddWhitelist}
          onRemoveWhitelist={handleRemoveWhitelist}
        />
      </div>
    </>
  )
}
