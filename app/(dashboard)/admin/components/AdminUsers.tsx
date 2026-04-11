'use client'

import { useMemo } from 'react'
import { RoleBadge } from './RoleBadge'
import { timeAgoLong } from '@/lib/format'
import type { DetailedUser } from '@/lib/types'

type SortKey = 'clips-desc' | 'clips-asc' | 'moments-desc' | 'last-seen' | 'joined' | 'channels-desc'
type FilterKey = 'all' | 'has-oauth' | 'no-oauth' | 'has-clips' | 'no-clips' | 'has-channels'

interface AdminUsersProps {
  detailedUsers: DetailedUser[]
  search: string
  setSearch: (v: string) => void
  sort: SortKey
  setSort: (v: SortKey) => void
  filter: FilterKey
  setFilter: (v: FilterKey) => void
  onDeleteUser: (id: string, username: string) => void
  onRevokeToken: (id: string, username: string) => void
}

export function AdminUsers({
  detailedUsers, search, setSearch, sort, setSort, filter, setFilter,
  onDeleteUser, onRevokeToken,
}: AdminUsersProps) {
  const filteredUsers = useMemo(() => {
    let list = [...detailedUsers]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.id.includes(q) ||
          u.channels.some((c) => c.channel.toLowerCase().includes(q))
      )
    }
    if (filter === 'has-oauth') list = list.filter((u) => u.hasOAuth)
    else if (filter === 'no-oauth') list = list.filter((u) => !u.hasOAuth)
    else if (filter === 'has-clips') list = list.filter((u) => u.clipsCreated > 0)
    else if (filter === 'no-clips') list = list.filter((u) => u.clipsCreated === 0)
    else if (filter === 'has-channels') list = list.filter((u) => u.channels.length > 0)

    if (sort === 'clips-desc') list.sort((a, b) => b.clipsCreated - a.clipsCreated)
    else if (sort === 'clips-asc') list.sort((a, b) => a.clipsCreated - b.clipsCreated)
    else if (sort === 'moments-desc') list.sort((a, b) => b.momentsTotal - a.momentsTotal)
    else if (sort === 'last-seen') list.sort((a, b) => b.lastSeen - a.lastSeen)
    else if (sort === 'joined') list.sort((a, b) => b.createdAt - a.createdAt)
    else if (sort === 'channels-desc') list.sort((a, b) => b.channels.length - a.channels.length)

    return list
  }, [detailedUsers, search, sort, filter])

  return (
    <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-6 mb-4">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div className="text-[12px] uppercase tracking-wider text-[#555]">user details</div>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search users..."
            className="bg-[#0a0a0a] border border-[#1a1a1a] rounded px-3 py-[8px] text-white text-[13px] outline-none w-[180px]"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-[#0a0a0a] border border-[#1a1a1a] rounded px-[12px] py-[8px] text-[#888] text-[13px] outline-none cursor-pointer"
          >
            <option value="clips-desc">most clips</option>
            <option value="clips-asc">least clips</option>
            <option value="moments-desc">most moments</option>
            <option value="last-seen">last seen</option>
            <option value="joined">newest</option>
            <option value="channels-desc">most channels</option>
          </select>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterKey)}
            className="bg-[#0a0a0a] border border-[#1a1a1a] rounded px-[12px] py-[8px] text-[#888] text-[13px] outline-none cursor-pointer"
          >
            <option value="all">all users</option>
            <option value="has-oauth">has OAuth</option>
            <option value="no-oauth">no OAuth</option>
            <option value="has-clips">has clips</option>
            <option value="no-clips">no clips</option>
            <option value="has-channels">has channels</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto py-1">
        {filteredUsers.length === 0 ? (
          <div className="text-[#333] text-center py-6">no users match</div>
        ) : (
          filteredUsers.map((u) => (
            <div key={u.id} className="bg-[#0e0e0e] border border-[#1a1a1a] hover:border-[#222] rounded-lg px-5 py-4">
              <div className="flex justify-between items-center mb-[12px] flex-wrap gap-2">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="text-[16px] font-semibold text-white">{u.username}</span>
                  <span className="text-[12px] text-[#333]">{u.id}</span>
                  <RoleBadge role={u.role} />
                  <span
                    className={`inline-flex items-center gap-1 text-[12px] px-2 py-[2px] rounded ${
                      u.hasOAuth ? 'bg-[#0a1a0a] text-[#22c55e]' : 'bg-[#1a1a1a] text-[#444]'
                    }`}
                  >
                    {u.hasOAuth ? '● OAuth connected' : '○ no OAuth'}
                  </span>
                </div>
                <div className="text-[12px] text-[#333]">
                  seen {timeAgoLong(u.lastSeen)} · joined {new Date(u.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex gap-4 mb-[12px]">
                <div className="text-[13px] text-[#555]">
                  <b className="text-[#22c55e] text-[15px]">{u.clipsCreated}</b> clips
                </div>
                <div className="text-[13px] text-[#555]">
                  <b className="text-white text-[15px]">{u.momentsTotal}</b> moments
                </div>
                <div className="text-[13px] text-[#555]">
                  <b className="text-white text-[15px]">{u.channels.filter((c) => c.confirmed).length}</b>/
                  <b className="text-white text-[15px]">{u.channels.length}</b> channels confirmed
                </div>
              </div>
              <div className="flex flex-wrap gap-[8px]">
                {u.channels.length > 0 ? (
                  u.channels.map((c) => (
                    <span
                      key={c.channel}
                      className={`text-[12px] px-2 py-[3px] rounded border ${
                        c.confirmed ? 'border-[#22c55e44] text-[#22c55e]' : 'border-[#f59e0b44] text-[#f59e0b]'
                      }`}
                    >
                      {c.channel} {c.confirmed ? '\u2713' : '\u23F3'}
                    </span>
                  ))
                ) : (
                  <span className="text-[12px] text-[#333]">no channels</span>
                )}
              </div>
              <div className="flex gap-[8px] mt-[12px] pt-[12px] border-t border-[#1a1a1a]">
                {u.hasOAuth && (
                  <button
                    onClick={() => onRevokeToken(u.id, u.username)}
                    className="border border-[#ef444444] text-[#ef4444] rounded text-[12px] px-[12px] py-1 hover:bg-[#1a0a0a]"
                  >
                    revoke OAuth
                  </button>
                )}
                {u.role !== 'admin' && (
                  <button
                    onClick={() => onDeleteUser(u.id, u.username)}
                    className="border border-[#ef444444] text-[#ef4444] rounded text-[12px] px-[12px] py-1 hover:bg-[#1a0a0a]"
                  >
                    revoke access
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
