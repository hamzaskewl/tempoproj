'use client'

import { useEffect, useState } from 'react'
import { getJSON } from '@/lib/api'
import type { ChannelStats, MyChannel } from '@/lib/types'

export function ConfirmedChannelStats({ channels }: { channels: MyChannel[] }) {
  const [stats, setStats] = useState<Record<string, ChannelStats>>({})

  useEffect(() => {
    if (channels.length === 0) {
      setStats({})
      return
    }
    const refresh = async () => {
      const next: Record<string, ChannelStats> = {}
      await Promise.all(
        channels.map(async (ch) => {
          try {
            next[ch.channel] = await getJSON<ChannelStats>(`/channel-stats/${ch.channel}`)
          } catch {}
        })
      )
      setStats(next)
    }
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [channels])

  const confirmed = channels.filter((c) => c.confirmed)
  if (confirmed.length === 0) return null

  return (
    <div className="space-y-2">
      {confirmed.map((ch) => {
        const s = stats[ch.channel]
        return (
          <div key={ch.channel} className="bg-[#111] border border-[#161616] rounded-md px-4 py-3 flex justify-between items-center text-[14px]">
            <span className="font-semibold text-white">{ch.channel}</span>
            <div className="flex items-center gap-4 text-[13px]">
              {s ? (
                <>
                  <span className={s.live ? 'text-[#22c55e]' : 'text-[#555]'}>{s.live ? 'live' : 'offline'}</span>
                  {s.viewers != null && <span className="text-[#666]">{s.viewers.toLocaleString()} viewers</span>}
                  {s.rate != null && <span className="text-[#555]">{s.rate.toFixed(1)} msg/s</span>}
                  {s.isSpike && <span className="text-[#f59e0b] font-bold">SPIKE +{s.jumpPercent}%</span>}
                </>
              ) : (
                <span className="text-[#333]">loading...</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
