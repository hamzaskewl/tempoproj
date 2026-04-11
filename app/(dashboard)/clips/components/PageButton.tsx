export function PageButton({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`bg-[#1a1a1a] border rounded px-3 py-[8px] text-[13px] min-w-[32px] text-center hover:bg-[#222] hover:text-[#999] disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? 'border-[#9146ff] text-[#9146ff] bg-[#1a0a2a]'
          : 'border-[#222] text-[#666]'
      }`}
    >
      {children}
    </button>
  )
}
