'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Topbar } from '@/components/Topbar'
import { VibeTag } from '@/components/VibeTag'
import { StatCard } from '@/components/StatCard'
import { SectionTitle } from './components/SectionTitle'
import { SpikeRow } from './components/SpikeRow'
import { useAuth } from '@/lib/useAuth'
import { useSSE } from '@/lib/useSSE'
import { swrFetcher } from '@/lib/api'
import { formatNumber, formatViewers, jumpClass, timeAgo } from '@/lib/format'
import type { Health, Spike, TrendingChannel } from '@/lib/types'

interface StatsResponse {
  moments?: {
    total?: number
    clipped?: number
    topChannels?: { channel: string; count: number }[]
  }
}

interface TrendingResponse {
  channels: TrendingChannel[]
}

interface LiveSpike extends Spike {
  receivedAt: number
}

export default function HomePage() {
  const { authenticated, user } = useAuth()
  const [spikes, setSpikes] = useState<LiveSpike[]>([])
  const [, forceTick] = useState(0)

  const { data: health } = useSWR<Health>('/health', swrFetcher, { refreshInterval: 10000 })
  const { data: stats } = useSWR<StatsResponse>('/api/stats', swrFetcher, { refreshInterval: 10000 })
  const { data: trending } = useSWR<TrendingResponse>('/trending', swrFetcher, { refreshInterval: 15000 })

  const { connected: sseConnected } = useSSE('/alerts', (data: any) => {
    if (data?.type === 'spike') {
      setSpikes((cur) => {
        const next = [{ ...data, receivedAt: Date.now() }, ...cur]
        return next.slice(0, 30)
      })
    }
  })

  // Re-render every 10s so timeAgo() refreshes
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 10000)
    return () => clearInterval(id)
  }, [])

  const live = sseConnected || (health?.connected ?? false)

  return (
    <>
      <Topbar status={{ live, label: live ? 'live' : 'connecting...' }} />

      <div className="grid lg:grid-cols-[1fr_340px] min-h-[calc(100vh-53px)]">
        {/* Main */}
        <div className="p-4 md:p-8 overflow-y-auto">
          <div className="mb-10">
            <h1 className="text-[24px] font-bold text-white mb-2">real-time twitch intelligence</h1>
            <p className="text-[15px] text-[#555] leading-[1.7] max-w-[560px]">
              clippy monitors thousands of twitch streams, detects chat activity spikes using AI, and auto-clips the best moments. see what&apos;s happening across twitch right now.
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-9">
            <StatCard val={formatNumber(health?.totalChannels)} label="channels tracked" sub="live right now" />
            <StatCard val={health?.totalMsgsPerSec?.toFixed(0) ?? '-'} label="messages / sec" sub="across all channels" />
            <StatCard val={formatNumber(stats?.moments?.total)} label="moments captured" sub="all-time" />
            <StatCard val={formatNumber(stats?.moments?.clipped)} label="clips created" sub="auto-generated" />
          </div>

          {/* Live spike feed */}
          <SectionTitle count={spikes.length}>live activity</SectionTitle>
          <div className="flex flex-col gap-1 mb-8">
            {spikes.length === 0 ? (
              <div className="text-[#1a1a1a] text-[14px] py-8 text-center">
                <span className="pulse">listening for spikes...</span>
              </div>
            ) : (
              spikes.slice(0, 15).map((s, i) => (
                <SpikeRow key={`${s.channel}-${s.receivedAt}-${i}`} spike={s} />
              ))
            )}
          </div>

          {/* Top channels */}
          {stats?.moments?.topChannels && stats.moments.topChannels.length > 0 && (
            <>
              <SectionTitle>top channels</SectionTitle>
              <div className="mb-8">
                {stats.moments.topChannels.slice(0, 8).map((ch, i) => (
                  <div
                    key={ch.channel}
                    className="flex justify-between items-center px-3 py-3 text-[14px] border-b border-[#111] last:border-b-0"
                  >
                    <span className="text-[#333] w-6">{i + 1}</span>
                    <span className="text-white font-medium flex-1">{ch.channel}</span>
                    <span className="text-[#555] text-[13px]">{ch.count} moments</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="border-t lg:border-t-0 lg:border-l border-[#141414] p-4 md:p-6 overflow-y-auto bg-[#0c0c0c]">
          <div className="mb-7">
            <SectionTitle>trending now</SectionTitle>
            <div className="flex flex-col gap-1">
              {!trending?.channels?.length ? (
                <div className="text-[#1a1a1a] text-[14px] py-4 text-center">loading...</div>
              ) : (
                trending.channels.map((ch) => (
                  <div
                    key={ch.channel}
                    className="flex justify-between items-center px-[18px] py-[12px] bg-[#111] border border-[#161616] rounded-md text-[14px]"
                  >
                    <span className="font-medium text-white truncate max-w-[140px]">{ch.channel}</span>
                    <span className="text-[#555] text-[13px] flex items-center">
                      <b className="text-[#ccc]">{ch.burst}</b>
                      <span className="ml-1">msg/s</span>
                      <VibeTag vibe={ch.vibe} className="ml-[8px]" />
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-6 text-center">
            {authenticated ? (
              <>
                <h3 className="text-[15px] font-semibold mb-2">your dashboard</h3>
                <p className="text-[13px] text-[#555] mb-4 leading-relaxed">
                  manage your 3 channel slots, see your clips, and monitor live activity.
                </p>
                <Link
                  href="/dashboard"
                  className="inline-block bg-[#9146ff] hover:bg-[#7c3aed] text-white text-[13px] font-semibold px-6 py-[12px] rounded-md"
                >
                  go to dashboard
                </Link>
              </>
            ) : (
              <>
                <h3 className="text-[15px] font-semibold mb-2">auto-clip your favorite streamers</h3>
                <p className="text-[13px] text-[#555] mb-4 leading-relaxed">
                  sign up to monitor up to 3 live channels. clippy will detect highlights and create clips on your twitch account automatically.
                </p>
                <Link
                  href="/login"
                  className="inline-block bg-[#9146ff] hover:bg-[#7c3aed] text-white text-[13px] font-semibold px-6 py-[12px] rounded-md"
                >
                  get started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

