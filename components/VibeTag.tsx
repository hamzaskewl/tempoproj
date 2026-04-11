import type { Vibe } from '@/lib/types'

const VIBE_STYLES: Record<Vibe, string> = {
  funny:     'bg-[#1a1a0a] text-[#fbbf24]',
  hype:      'bg-[#0a1a0a] text-[#22c55e]',
  awkward:   'bg-[#1a0a1a] text-[#c084fc]',
  win:       'bg-[#0a1a1a] text-[#38bdf8]',
  loss:      'bg-[#1a0a0a] text-[#f87171]',
  rage:      'bg-[#1a0a0a] text-[#ef4444]',
  shock:     'bg-[#1a1a0a] text-[#fb923c]',
  clutch:    'bg-[#0a1a0a] text-[#34d399]',
  wholesome: 'bg-[#0a1a1a] text-[#67e8f9]',
  drama:     'bg-[#1a0a1a] text-[#e879f9]',
  sad:       'bg-[#1a0a0a] text-[#f87171]',
  neutral:   'bg-[#1a1a1a] text-[#555555]',
  error:     'bg-[#1a0a0a] text-[#ef4444]',
}

export function VibeTag({ vibe, className = '' }: { vibe: Vibe | string; className?: string }) {
  const style = VIBE_STYLES[vibe as Vibe] ?? VIBE_STYLES.neutral
  return (
    <span
      className={`inline-block rounded text-[12px] font-medium px-2 py-[3px] text-center ${style} ${className}`}
    >
      {vibe}
    </span>
  )
}
