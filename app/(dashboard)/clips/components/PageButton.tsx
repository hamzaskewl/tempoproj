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
      className={`btn-purple text-[13px] py-[8px] px-4 min-w-[40px] disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? '' : 'opacity-60'
      }`}
    >
      {children}
    </button>
  )
}
