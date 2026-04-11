import { VibeTag } from '@/components/VibeTag'
import { jumpClass, timeAgoLong } from '@/lib/format'
import type { DashboardMoment, Vibe } from '@/lib/types'

export function MomentCard({
  m,
  open,
  embedVisible,
  onToggle,
  onToggleEmbed,
}: {
  m: DashboardMoment
  open: boolean
  embedVisible: boolean
  onToggle: () => void
  onToggleEmbed: () => void
}) {
  const jc = jumpClass(m.jumpPercent)
  const jumpColor = jc === 'mega' ? 'text-[#f59e0b]' : jc === 'high' ? 'text-[#22c55e]' : ''
  const moodTag = (m.mood || m.vibe) as Vibe
  const clipSlug = m.clipUrl ? m.clipUrl.split('/').pop() : null

  return (
    <>
      <div
        onClick={onToggle}
        className={`grid grid-cols-[1fr_auto] md:grid-cols-[140px_70px_60px_1fr_80px] items-center gap-3 px-4 py-[18px] bg-[#111] border border-[#161616] rounded-md text-[14px] cursor-pointer hover:bg-[#151515] hover:border-[#222] transition-colors ${
          m.clipUrl ? 'border-l-[3px] border-l-[#22c55e]' : ''
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white text-[15px]">{m.channel}</span>
          {m.viewers ? <span className="text-[#444] text-[12px]">{(m.viewers / 1000).toFixed(1)}k</span> : null}
        </div>
        <span className={`font-bold text-[15px] ${jumpColor}`}>+{m.jumpPercent}%</span>
        <VibeTag vibe={moodTag} className="hidden md:inline-block" />
        <span className="text-[#555] text-[13px] truncate hidden md:block">{m.description || ''}</span>
        <span className="text-[#333] text-[12px] text-right hidden md:block">{timeAgoLong(m.receivedAt)}</span>
      </div>
      {open && (
        <div className="bg-[#0e0e0e] border border-[#1a1a1a] border-t-0 rounded-b-md -mt-1 mb-1 p-4">
          <div className="flex gap-2 mb-3">
            {m.clipUrl && (
              <a
                href={m.clipUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[12px] px-[12px] py-1 bg-[#1a1a1a] text-[#22c55e] border border-[#22c55e44] rounded"
              >
                view clip
              </a>
            )}
            {clipSlug && (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleEmbed()
                }}
                className={`inline-flex items-center gap-[8px] text-[12px] cursor-pointer select-none px-[12px] py-1 bg-[#1a1a1a] hover:bg-[#222] hover:text-[#999] border border-[#222] rounded ${
                  embedVisible ? 'text-[#999]' : 'text-[#555]'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${embedVisible ? 'bg-[#22c55e]' : 'bg-[#333]'}`} />
                {embedVisible ? 'hide clip' : 'show clip'}
              </span>
            )}
            {m.vodUrl && (
              <a
                href={m.vodUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[12px] px-[12px] py-1 bg-[#1a1a1a] hover:bg-[#222] text-[#666] hover:text-[#999] border border-[#222] rounded"
              >
                vod
              </a>
            )}
          </div>
          {m.description && (
            <div className="text-[14px] text-[#888] mb-3 leading-[1.6]">
              <b>{m.mood || ''}</b> — {m.description}
            </div>
          )}
          {embedVisible && clipSlug && typeof window !== 'undefined' && (
            <div className="w-full aspect-video rounded-md overflow-hidden mt-3 bg-[#0a0a0a]">
              <iframe
                src={`https://clips.twitch.tv/embed?clip=${clipSlug}&parent=${location.hostname}`}
                className="w-full h-full border-0"
                allowFullScreen
              />
            </div>
          )}
          {m.chatSnapshot && m.chatSnapshot.length > 0 && (
            <div className="text-[13px] text-[#444] leading-[1.7] max-h-[180px] overflow-y-auto px-3 py-[12px] bg-[#0a0a0a] rounded">
              {m.chatSnapshot.slice(0, 15).map((line, idx) => {
                const colonIdx = line.indexOf(': ')
                if (colonIdx > -1) {
                  return (
                    <div key={idx}>
                      <span className="text-[#555]">{line.slice(0, colonIdx)}:</span>{' '}
                      {line.slice(colonIdx + 2)}
                    </div>
                  )
                }
                return <div key={idx}>{line}</div>
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}
