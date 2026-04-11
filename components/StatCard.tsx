export function StatCard({ val, label, sub }: { val: React.ReactNode; label: string; sub?: string }) {
  return (
    <div className="bg-[#111] border border-[#161616] rounded-lg p-5">
      <div className="text-[32px] font-bold text-white mb-1">{val}</div>
      <div className="text-[12px] uppercase tracking-wider text-[#444]">{label}</div>
      {sub && <div className="text-[12px] text-[#333] mt-1">{sub}</div>}
    </div>
  )
}
