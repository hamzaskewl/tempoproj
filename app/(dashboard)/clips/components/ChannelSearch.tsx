'use client'

import { useEffect, useMemo, useState } from 'react'

interface ChannelMatch {
  channel: string
  count: number
}

export function ChannelSearch({
  topChannels,
  search,
  setSearch,
  onSelect,
  onApply,
}: {
  topChannels: ChannelMatch[]
  search: string
  setSearch: (v: string) => void
  onSelect: (channel: string) => void
  onApply: () => void
}) {
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('#channelSearch') && !t.closest('#searchResults')) setSearchOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const searchMatches = useMemo(() => {
    if (!search.trim() || !topChannels.length) return []
    const q = search.toLowerCase()
    return topChannels.filter((ch) => ch.channel.toLowerCase().includes(q)).slice(0, 10)
  }, [search, topChannels])

  return (
    <div className="relative">
      <input
        id="channelSearch"
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setSearchOpen(true) }}
        onKeyDown={(e) => e.key === 'Enter' && onApply()}
        placeholder="search channel..."
        className="bg-[#111] border border-[#1a1a1a] rounded-md pl-[30px] pr-[14px] py-2 text-white text-[14px] outline-none w-[220px]"
      />
      <svg className="absolute left-[10px] top-1/2 -translate-y-1/2 opacity-30 pointer-events-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      {searchOpen && search.trim() && (
        <div id="searchResults" className="absolute top-full left-0 right-0 bg-[#111] border border-[#222] rounded-md mt-1 max-h-[200px] overflow-y-auto z-50">
          {searchMatches.length > 0 ? (
            searchMatches.map((ch) => (
              <div key={ch.channel} className="px-3 py-2 text-[13px] text-[#ccc] cursor-pointer flex justify-between hover:bg-[#1a1a1a]"
                onClick={() => { onSelect(ch.channel); setSearchOpen(false) }}>
                <span>{ch.channel}</span>
                <span className="text-[#444]">{ch.count} clips</span>
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-[13px] text-[#666] cursor-pointer" onClick={() => { onApply(); setSearchOpen(false) }}>
              {search} <span className="text-[#444]">— search</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
