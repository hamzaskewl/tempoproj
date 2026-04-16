'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { Topbar } from '@/components/Topbar'
import { ConnectWalletButton } from '@/components/ConnectWalletButton'
import { MarketCard } from '@/components/MarketCard'
import type { MarketRow } from '../lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const MOOD_COLOR: Record<string, string> = {
  hype: '#f59e0b',
  funny: '#eab308',
  rage: '#dc2626',
  clutch: '#22c55e',
  awkward: '#a855f7',
  wholesome: '#ec4899',
  drama: '#8b5cf6',
  shock: '#06b6d4',
  sad: '#64748b',
}

interface ChannelGroup {
  channel: string
  openCount: number
  moods: string[]
  totalPool: number
  markets: MarketRow[]
}

function groupByChannel(rows: MarketRow[]): ChannelGroup[] {
  const map = new Map<string, ChannelGroup>()
  for (const m of rows) {
    let g = map.get(m.channel)
    if (!g) {
      g = { channel: m.channel, openCount: 0, moods: [], totalPool: 0, markets: [] }
      map.set(m.channel, g)
    }
    g.markets.push(m)
    if (m.state === 'open') {
      g.openCount++
      if (!g.moods.includes(m.mood)) g.moods.push(m.mood)
      try {
        g.totalPool += Number(BigInt(m.totalYes)) / 1_000_000 + Number(BigInt(m.totalNo)) / 1_000_000
      } catch {}
    }
  }
  return Array.from(map.values()).sort((a, b) => b.openCount - a.openCount)
}

export function MarketsList() {
  const { data, error, isLoading } = useSWR<MarketRow[]>('/api/markets', fetcher, {
    refreshInterval: 5000,
  })

  const rows = Array.isArray(data) ? data : []
  const groups = groupByChannel(rows)
  const hasOpen = groups.some((g) => g.openCount > 0)

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Topbar showLogout />

      <div className="max-w-[1100px] mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[22px] font-semibold text-white">Prediction Markets</h1>
            <p className="text-[13px] text-[#555] mt-1">
              Bet on whether a mood spike fires on-stream. Settled by AI oracle on Solana.
            </p>
          </div>
          <ConnectWalletButton />
        </div>

        {error && (
          <div className="text-[13px] text-[#dc2626] bg-[#1a0a0a] border border-[#dc262644] rounded px-4 py-3 mb-4">
            Failed to load markets: {String(error)}
          </div>
        )}

        {isLoading && (
          <div className="text-[13px] text-[#444] py-16 text-center">Loading...</div>
        )}

        {!isLoading && !hasOpen && groups.length === 0 && (
          <div className="text-[13px] text-[#555] py-16 text-center border border-dashed border-[#222] rounded-md">
            No markets yet — they auto-create every 5 minutes for watched channels.
          </div>
        )}

        {/* Channel cards */}
        {groups.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {groups.map((g) => (
              <Link
                key={g.channel}
                href={`/markets/${g.channel}`}
                className="block bg-[#0e0e0e] border border-[#1a1a1a] rounded-lg p-5 hover:border-[#333] transition-colors group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {g.openCount > 0 && (
                      <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                    )}
                    <span className="text-[16px] font-semibold text-white group-hover:text-[#9146ff] transition-colors">
                      {g.channel}
                    </span>
                  </div>
                  <span className="text-[12px] text-[#555]">
                    {g.openCount > 0 ? `${g.openCount} open` : 'no open'}
                  </span>
                </div>

                {g.moods.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {g.moods.map((mood) => (
                      <span
                        key={mood}
                        className="text-[10px] uppercase tracking-wide font-semibold px-[6px] py-[1px] rounded"
                        style={{
                          color: MOOD_COLOR[mood] || '#666',
                          backgroundColor: `${MOOD_COLOR[mood] || '#666'}18`,
                        }}
                      >
                        {mood}
                      </span>
                    ))}
                  </div>
                )}

                {g.totalPool > 0 && (
                  <div className="text-[11px] text-[#555]">
                    Pool: <span className="text-[#888] font-mono">${g.totalPool.toFixed(2)}</span> USDC
                  </div>
                )}

                <div className="text-[11px] text-[#333] mt-2 group-hover:text-[#555] transition-colors">
                  Watch &amp; bet &rarr;
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* All open markets grid below channels */}
        {rows.filter((m) => m.state === 'open').length > 0 && (
          <>
            <div className="text-[11px] uppercase tracking-wider text-[#555] font-semibold mb-3">
              All Open Markets
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rows.filter((m) => m.state === 'open').map((m) => (
                <MarketCard key={m.pda} market={m} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
