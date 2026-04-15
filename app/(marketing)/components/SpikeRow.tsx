import { VibeTag } from '@/components/VibeTag'
import { jumpClass } from '@/lib/format'
import type { Vibe } from '@/lib/types'

interface LiveSpike {
  channel: string
  jumpPercent: number
  viewers?: number | null
  vibe: Vibe
  vodTimestamp?: string | null
  receivedAt: number
}

function formatViewers(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export function SpikeRow({ spike }: { spike: LiveSpike }) {
  const jc = jumpClass(spike.jumpPercent)
  const jumpColor = jc === 'mega' ? 'text-[#f59e0b]' : jc === 'high' ? 'text-[#22c55e]' : ''
  return (
    <div className="grid grid-cols-[1fr_auto] md:grid-cols-[160px_80px_90px_1fr_100px] items-center gap-5 px-5 py-4 bg-[#111] border border-[#161616] rounded-md text-[14px]">
      <div>
        <span className="font-semibold text-white">{spike.channel}</span>
        {spike.viewers ? <span className="text-[#444] text-[12px] ml-2">{formatViewers(spike.viewers)}</span> : null}
      </div>
      <span className={`font-bold ${jumpColor}`}>+{spike.jumpPercent}%</span>
      <VibeTag vibe={spike.vibe} className="hidden md:inline-block" />
      <span className="text-[#555] text-[13px] truncate hidden md:block">{spike.vodTimestamp || ''}</span>
      <span className="text-[#333] text-[12px] text-right hidden md:block">{timeAgo(spike.receivedAt)}</span>
    </div>
  )
}
