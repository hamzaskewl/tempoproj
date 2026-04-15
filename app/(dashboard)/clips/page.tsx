'use client'

import { useEffect, useMemo, useState } from 'react'
import { Topbar } from '@/components/Topbar'
import { AuthGuard } from '@/components/AuthGuard'
import { ClipCard } from './components/ClipCard'
import { PageButton } from './components/PageButton'
import { ChannelSearch } from './components/ChannelSearch'
import { swrFetcher, getJSON } from '@/lib/api'
import { paginationPages } from '@/lib/pagination'
import type { ClipsResponse, MyChannel } from '@/lib/types'

const PER_PAGE = 12

export default function ClipsPage() {
  return <AuthGuard><ClipsInner /></AuthGuard>
}

function ClipsInner() {
  const [data, setData] = useState<ClipsResponse | null>(null)
  const [page, setPage] = useState(1)
  const [filterChannel, setFilterChannel] = useState<string | null>(null)
  const [myClipsOnly, setMyClipsOnly] = useState(false)
  const [myChannels, setMyChannels] = useState<string[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    getJSON<{ channels: MyChannel[] }>('/my/channels')
      .then((d) => setMyChannels((d.channels || []).map((c) => c.channel)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const offset = (page - 1) * PER_PAGE
    let url = `/api/clips?limit=${PER_PAGE}&offset=${offset}`
    if (filterChannel) url += `&channel=${encodeURIComponent(filterChannel)}`
    swrFetcher<ClipsResponse>(url).then((d) => setData(d)).catch(() => {})
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [page, filterChannel])

  const stats = data?.stats
  const totalPages = useMemo(() => data ? Math.max(1, Math.ceil(data.filteredTotal / PER_PAGE)) : 1, [data])
  const filteredClips = useMemo(() => {
    if (!data) return []
    return myClipsOnly && myChannels.length > 0 ? data.clips.filter((c) => myChannels.includes(c.channel.toLowerCase())) : data.clips
  }, [data, myClipsOnly, myChannels])
  const clipRate = stats && stats.total > 0 ? Math.round((stats.clipped / stats.total) * 100) : 0

  function toggleFilter(channel: string) {
    setFilterChannel((cur) => (cur === channel ? null : channel))
    setSearch(channel === filterChannel ? '' : channel)
    setPage(1)
  }

  return (
    <>
      <Topbar showLogout />
      <div className="max-w-[1400px] mx-auto p-4 md:p-8">
        <div className="flex gap-4 md:gap-8 mb-8 py-5 border-b border-[#111]">
          <div>
            <div className="text-[32px] font-bold text-white">{stats?.total?.toLocaleString() ?? '-'}</div>
            <div className="text-[11px] uppercase tracking-wider text-[#444] mt-[3px]">total moments</div>
          </div>
          <div>
            <div className="text-[32px] font-bold text-white">{stats?.clipped?.toLocaleString() ?? '-'}</div>
            <div className="text-[11px] uppercase tracking-wider text-[#444] mt-[3px]">clips created</div>
          </div>
          <div>
            <div className="text-[32px] font-bold text-white">{clipRate}%</div>
            <div className="text-[11px] uppercase tracking-wider text-[#444] mt-[3px]">clip rate</div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-3">
          <div className="text-[12px] font-medium uppercase tracking-[2px] text-[#444]">top channels</div>
          <ChannelSearch
            topChannels={stats?.topChannels || []}
            search={search}
            setSearch={setSearch}
            onSelect={(ch) => { setFilterChannel(ch.toLowerCase()); setSearch(ch); setPage(1) }}
            onApply={() => { setFilterChannel(search.trim() ? search.trim().toLowerCase() : null); setPage(1) }}
          />
        </div>

        <div className="flex gap-2 flex-wrap mb-8">
          {stats?.topChannels?.map((ch) => (
            <button key={ch.channel} onClick={() => toggleFilter(ch.channel)}
              className={`btn-purple text-[13px] py-[8px] px-4 ${filterChannel === ch.channel ? '' : 'opacity-60'}`}>
              {ch.channel}<span className="ml-1 opacity-70">{ch.count}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-between items-center mb-4">
          <div className="text-[12px] font-medium uppercase tracking-[2px] text-[#444]">recent clips</div>
          {myChannels.length > 0 && (
            <div className="flex items-center gap-[12px] text-[14px] text-[#666] cursor-pointer select-none" onClick={() => setMyClipsOnly((v) => !v)}>
              <span>my channels only</span>
              <div className={`w-9 h-5 rounded-full relative transition-colors ${myClipsOnly ? 'bg-[#9146ff]' : 'bg-[#222]'}`}>
                <div className={`w-4 h-4 rounded-full absolute top-[2px] transition-all ${myClipsOnly ? 'left-[18px] bg-white' : 'left-[2px] bg-[#555]'}`} />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {!data ? <div className="text-[#222] text-[14px] text-center py-12 col-span-full">loading...</div>
            : filteredClips.length === 0 ? <div className="text-[#222] text-[14px] text-center py-12 col-span-full">no clips yet</div>
            : filteredClips.map((c) => <ClipCard key={c.id} c={c} />)}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-1 py-6">
            <PageButton disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>«</PageButton>
            {paginationPages(page, totalPages).map((p, i) =>
              p === '...' ? <span key={`e${i}`} className="text-[13px] text-[#333] px-2">...</span>
                : <PageButton key={p} active={p === page} onClick={() => setPage(p as number)}>{p}</PageButton>
            )}
            <PageButton disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>»</PageButton>
          </div>
        )}
      </div>
    </>
  )
}
