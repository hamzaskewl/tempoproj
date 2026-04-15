export function RoleBadge({ role }: { role: 'admin' | 'user' }) {
  const isAdmin = role === 'admin'
  return (
    <span
      className={`inline-block text-[12px] font-semibold px-[10px] py-[2px] rounded-full bg-gradient-to-b border-[0.5px] shadow-sm ${
        isAdmin
          ? 'from-[#e9d5ff] via-[#9146ff] to-[#c084fc] text-[#2d0a4e] border-[#9146ff33]'
          : 'from-[#404040] via-[#555555] to-[#404040] text-[#e0e0e0] border-[#55555533]'
      }`}
    >
      {role}
    </span>
  )
}
