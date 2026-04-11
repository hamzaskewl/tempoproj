export function StatusDot({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-block w-[6px] h-[6px] rounded-full ${live ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`}
    />
  )
}

export function StatusPill({ live, label }: { live: boolean; label: string }) {
  return (
    <div className="flex items-center gap-[8px] text-[13px] text-[#555] px-[12px] py-1 border border-[#1a1a1a] rounded-full">
      <StatusDot live={live} />
      <span>{label}</span>
    </div>
  )
}
