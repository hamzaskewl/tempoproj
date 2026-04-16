'use client'

export function OddsBar({ yesPct }: { yesPct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-mono text-[#22c55e] w-[32px]">{yesPct}%</span>
      <div className="flex-1 h-[6px] bg-[#1a1a1a] rounded-full overflow-hidden flex">
        <div
          className="h-full bg-[#22c55e] transition-all duration-700 ease-out"
          style={{ width: `${yesPct}%` }}
        />
        <div
          className="h-full bg-[#dc2626] transition-all duration-700 ease-out"
          style={{ width: `${100 - yesPct}%` }}
        />
      </div>
      <span className="text-[11px] font-mono text-[#dc2626] w-[32px] text-right">{100 - yesPct}%</span>
    </div>
  )
}
