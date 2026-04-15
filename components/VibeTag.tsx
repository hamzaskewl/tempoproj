import type { Vibe } from '@/lib/types'

const VIBE_STYLES: Record<Vibe, { gradient: string; text: string; border: string }> = {
  funny:     { gradient: 'from-[#fde68a] via-[#fbbf24] to-[#fde68a]', text: 'text-[#78350f]', border: 'border-[#fbbf2433]' },
  hype:      { gradient: 'from-[#86efac] via-[#22c55e] to-[#86efac]', text: 'text-[#052e16]', border: 'border-[#22c55e33]' },
  awkward:   { gradient: 'from-[#e9d5ff] via-[#c084fc] to-[#e9d5ff]', text: 'text-[#3b0764]', border: 'border-[#c084fc33]' },
  win:       { gradient: 'from-[#bae6fd] via-[#38bdf8] to-[#bae6fd]', text: 'text-[#0c4a6e]', border: 'border-[#38bdf833]' },
  loss:      { gradient: 'from-[#fecaca] via-[#f87171] to-[#fecaca]', text: 'text-[#7f1d1d]', border: 'border-[#f8717133]' },
  rage:      { gradient: 'from-[#fecaca] via-[#ef4444] to-[#fecaca]', text: 'text-[#7f1d1d]', border: 'border-[#ef444433]' },
  shock:     { gradient: 'from-[#fed7aa] via-[#fb923c] to-[#fed7aa]', text: 'text-[#7c2d12]', border: 'border-[#fb923c33]' },
  clutch:    { gradient: 'from-[#a7f3d0] via-[#34d399] to-[#a7f3d0]', text: 'text-[#064e3b]', border: 'border-[#34d39933]' },
  wholesome: { gradient: 'from-[#a5f3fc] via-[#67e8f9] to-[#a5f3fc]', text: 'text-[#164e63]', border: 'border-[#67e8f933]' },
  drama:     { gradient: 'from-[#f5d0fe] via-[#e879f9] to-[#f5d0fe]', text: 'text-[#701a75]', border: 'border-[#e879f933]' },
  sad:       { gradient: 'from-[#fecaca] via-[#f87171] to-[#fecaca]', text: 'text-[#7f1d1d]', border: 'border-[#f8717133]' },
  neutral:   { gradient: 'from-[#404040] via-[#555555] to-[#404040]', text: 'text-[#e0e0e0]', border: 'border-[#55555533]' },
  error:     { gradient: 'from-[#fecaca] via-[#ef4444] to-[#fecaca]', text: 'text-[#7f1d1d]', border: 'border-[#ef444433]' },
}

export function VibeTag({ vibe, className = '' }: { vibe: Vibe | string; className?: string }) {
  const style = VIBE_STYLES[vibe as Vibe] ?? VIBE_STYLES.neutral
  return (
    <span
      className={`inline-block rounded-full text-[12px] font-semibold px-[10px] py-[3px] text-center bg-gradient-to-b ${style.gradient} ${style.text} border-[0.5px] ${style.border} shadow-sm hover:scale-103 active:scale-97 transition-transform ${className}`}
    >
      {vibe}
    </span>
  )
}
