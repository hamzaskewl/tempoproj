export function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-[12px] uppercase tracking-wider text-[#444] px-3 py-2 border-b border-[#1a1a1a] sticky top-0 bg-[#111]">
      {children}
    </th>
  )
}
