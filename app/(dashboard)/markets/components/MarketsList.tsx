'use client'

import useSWR from 'swr'
import { MarketCard } from '@/components/MarketCard'
import { ConnectWalletButton } from '@/components/ConnectWalletButton'
import type { MarketRow } from '../lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function MarketsList({ channel }: { channel?: string }) {
  const { data, error, isLoading } = useSWR<MarketRow[]>('/api/markets', fetcher, {
    refreshInterval: 5000,
  })

  const rows = Array.isArray(data) ? data : []
  const openMarkets = rows.filter((m) => m.state === 'open' && (!channel || m.channel === channel.toLowerCase()))
  const resolvedMarkets = channel
    ? rows.filter((m) => m.state !== 'open' && m.channel === channel.toLowerCase())
    : []

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[22px] font-semibold text-white">
            {channel ? `${channel} markets` : 'Prediction markets'}
          </h1>
          <p className="text-[13px] text-[#555] mt-1">
            Bet YES/NO on whether a mood spike fires on-stream inside a 5-minute window.
          </p>
        </div>
        <ConnectWalletButton />
      </div>

      {error && (
        <div className="text-[13px] text-[#dc2626] bg-[#1a0a0a] border border-[#dc262644] rounded px-4 py-3 mb-4">
          Failed to load markets: {String(error)}
        </div>
      )}

      {isLoading && openMarkets.length === 0 && (
        <div className="text-[13px] text-[#444] py-16 text-center">Loading…</div>
      )}

      {!isLoading && openMarkets.length === 0 && (
        <div className="text-[13px] text-[#555] py-16 text-center border border-dashed border-[#222] rounded-md">
          No open markets yet — they auto-create every 5 minutes.
        </div>
      )}

      {openMarkets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {openMarkets.map((m) => (
            <MarketCard key={m.pda} market={m} />
          ))}
        </div>
      )}

      {resolvedMarkets.length > 0 && (
        <div className="mt-12">
          <h2 className="text-[15px] font-semibold text-[#888] mb-3">Recent resolved</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {resolvedMarkets.map((m) => (
              <MarketCard key={m.pda} market={m} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
