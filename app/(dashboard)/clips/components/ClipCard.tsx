import { VibeTag } from '@/components/VibeTag'
import { jumpClass } from '@/lib/format'
import type { Clip } from '@/lib/types'

export function ClipCard({ c }: { c: Clip }) {
  const jc = jumpClass(c.jumpPercent)
  const jumpColor = jc === 'mega' ? 'text-[#f59e0b]' : jc === 'high' ? 'text-[#22c55e]' : ''
  const moodTag = c.mood || c.vibe
  const clipSlug = c.clipUrl ? c.clipUrl.split('/').pop() : null
  const time = new Date(c.timestamp).toLocaleString()
  const embedSrc =
    clipSlug && typeof window !== 'undefined'
      ? `https://clips.twitch.tv/embed?clip=${clipSlug}&parent=${location.hostname}&autoplay=false&muted=true`
      : null

  return (
    <div className="bg-[#111] border border-[#1a1a1a] rounded-lg overflow-hidden hover:border-[#333] transition-colors">
      {embedSrc && (
        <div className="w-full aspect-video bg-[#0a0a0a]">
          <iframe src={embedSrc} className="w-full h-full border-0" loading="lazy" allowFullScreen />
        </div>
      )}
      <div className="px-4 py-[18px]">
        <div className="flex justify-between items-center mb-[8px]">
          <span className="text-[15px] font-semibold text-white">{c.channel}</span>
          <span className={`text-[14px] font-bold ${jumpColor}`}>+{c.jumpPercent}%</span>
        </div>
        <div className="flex gap-2 items-center mb-[8px]">
          <VibeTag vibe={moodTag as any} />
          <span className="text-[12px] text-[#333]">{time}</span>
        </div>
        {c.description && (
          <div className="text-[14px] text-[#666] leading-[1.5]">{c.description}</div>
        )}
        <div className="flex gap-2 mt-[12px]">
          {c.clipUrl && (
            <a href={c.clipUrl} target="_blank" rel="noreferrer" className="text-[12px] px-[12px] py-1 bg-[#1a1a1a] text-[#22c55e] border border-[#22c55e44] rounded hover:bg-[#222]">watch clip</a>
          )}
          {c.vodUrl && (
            <a href={c.vodUrl} target="_blank" rel="noreferrer" className="text-[12px] px-[12px] py-1 bg-[#1a1a1a] text-[#666] border border-[#222] rounded hover:bg-[#222] hover:text-[#999]">vod</a>
          )}
          <a href={`/clip/${c.id}`} className="text-[12px] px-[12px] py-1 bg-[#1a1a1a] text-[#666] border border-[#222] rounded hover:bg-[#222] hover:text-[#999]">details</a>
        </div>
      </div>
    </div>
  )
}
