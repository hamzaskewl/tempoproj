export function SectionTitle({ count, children }: { count?: number; children: React.ReactNode }) {
  return (
    <div className="text-[12px] font-medium uppercase tracking-[2px] text-[#444] mb-3 flex items-center gap-2">
      {children}
      {count != null && (
        <span className="bg-[#1a1a1a] text-[#555] text-[12px] px-[8px] py-[1px] rounded">{count}</span>
      )}
    </div>
  )
}
