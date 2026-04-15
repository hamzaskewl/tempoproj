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
      className={`flex items-center gap-[8px] text-[13px] font-semibold px-[12px] py-[6px] rounded-full bg-[#0d0d0d] border-[0.5px] shadow-sm ${
        live ? 'text-[#22c55e] border-[#22c55e55]' : 'text-[#ef4444] border-[#ef444455]'
      }`}
    >
      <StatusDot live={live} />
      <span>{label}</span>
    </div>
  )
}
