'use client'

const STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  open: { bg: 'bg-[#1a1a1a]', border: 'border-[#333]', text: 'text-[#888]', label: 'OPEN' },
  yes: { bg: 'bg-[#0e1e14]', border: 'border-[#22c55e44]', text: 'text-[#22c55e]', label: 'YES' },
  no: { bg: 'bg-[#1e0e0e]', border: 'border-[#dc262644]', text: 'text-[#dc2626]', label: 'NO' },
  void: { bg: 'bg-[#1a1a1a]', border: 'border-[#555]', text: 'text-[#555]', label: 'VOID' },
}

export function ResolutionBadge({ state }: { state: string }) {
  const s = STYLES[state] || STYLES.open
  return (
    <span className={`inline-flex items-center text-[10px] uppercase tracking-wider font-semibold px-2 py-[2px] rounded border ${s.bg} ${s.border} ${s.text}`}>
      {s.label}
    </span>
  )
}
