export function RoleBadge({ role }: { role: 'admin' | 'user' }) {
  return (
    <span
      className={`inline-block text-[12px] font-medium px-2 py-[2px] rounded ${
        role === 'admin' ? 'bg-[#1a0a2a] text-[#9146ff]' : 'bg-[#111] text-[#555]'
      }`}
    >
      {role}
    </span>
  )
}
