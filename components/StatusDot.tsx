export function StatusDot({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-block w-[6px] h-[6px] rounded-full ${live ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`}
    />
  )
}

export function StatusPill({ live, label }: { live: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-[8px] text-[13px] font-semibold px-[12px] py-1 rounded-full bg-gradient-to-b border-[0.5px] shadow-sm ${
        live
          ? 'from-[#86efac] via-[#22c55e] to-[#86efac] text-[#052e16] border-[#22c55e33]'
          : 'from-[#fecaca] via-[#ef4444] to-[#fecaca] text-[#7f1d1d] border-[#ef444433]'
      }`}
    >
      <StatusDot live={live} />
      <span>{label}</span>
    </div>
  )
}
