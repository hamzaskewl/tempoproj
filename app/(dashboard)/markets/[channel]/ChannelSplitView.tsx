'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { MarketCard } from '@/components/MarketCard'
import { ConnectWalletButton } from '@/components/ConnectWalletButton'
import { TwitchPlayer } from '../components/TwitchPlayer'
import type { MarketRow } from '../lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function ChannelSplitView({ channel }: { channel: string }) {
  const { data, error, isLoading } = useSWR<MarketRow[]>('/api/markets', fetcher, {
    refreshInterval: 3000,
  })

  const rows = Array.isArray(data) ? data : []
  const channelLower = channel.toLowerCase()
  const openMarkets = rows.filter((m) => m.state === 'open' && m.channel === channelLower)
  const resolvedMarkets = rows
    .filter((m) => m.state !== 'open' && m.channel === channelLower)
    .slice(0, 6)

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#141414] bg-[#0d0d0d] shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/markets" className="text-[#555] hover:text-white text-[13px] transition-colors">
            &larr; markets
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#dc2626] animate-pulse" />
            <span className="text-[16px] font-semibold text-white">{channel}</span>
          </div>
        </div>
        <ConnectWalletButton />
      </div>

      {/* Split view */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Twitch player */}
        <div className="flex-1 min-w-0 p-3">
          <TwitchPlayer channel={channel} />
        </div>

        {/* Right: Markets panel */}
        <div className="w-[380px] border-l border-[#141414] bg-[#0c0c0c] overflow-y-auto">
          <div className="p-4">
            <div className="text-[11px] uppercase tracking-wider text-[#555] font-semibold mb-3">
              Open Markets
            </div>

            {error && (
              <div className="text-[11px] text-[#dc2626] bg-[#1a0a0a] border border-[#dc262633] rounded px-3 py-2 mb-3">
                Failed to load markets
              </div>
            )}

            {isLoading && openMarkets.length === 0 && (
              <div className="text-[12px] text-[#333] py-8 text-center">Loading...</div>
            )}

            {!isLoading && openMarkets.length === 0 && (
              <div className="text-[12px] text-[#444] py-8 text-center border border-dashed border-[#1a1a1a] rounded-lg">
                No open markets yet.<br />
                <span className="text-[#333]">New markets open every 5 minutes.</span>
              </div>
            )}

            <div className="space-y-3">
              {openMarkets.map((m) => (
                <MarketCard key={m.pda} market={m} compact />
              ))}
            </div>

            {resolvedMarkets.length > 0 && (
              <>
                <div className="text-[11px] uppercase tracking-wider text-[#333] font-semibold mt-6 mb-3">
                  Recent
                </div>
                <div className="space-y-3">
                  {resolvedMarkets.map((m) => (
                    <MarketCard key={m.pda} market={m} compact />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
