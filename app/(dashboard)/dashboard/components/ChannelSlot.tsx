import type { MyChannel } from '@/lib/types'

export function ChannelSlot({
  ch,
  onConfirm,
  onRemove,
}: {
  ch: MyChannel
  onConfirm: () => void
  onRemove: () => void
}) {
  return (
    <div className="bg-[#111] border border-[#161616] rounded-lg px-5 py-4">
      <div className="flex justify-between items-center mb-2 gap-2 flex-col md:flex-row md:items-center items-start">
        <span className="text-[16px] font-semibold text-white">{ch.channel}</span>
        <div className="flex items-center gap-2">
          {!ch.confirmed ? (
            <button
              onClick={onConfirm}
              className="bg-[#1a1a1a] hover:bg-[#0a1a0a] text-[#22c55e] border border-[#22c55e44] rounded px-3 py-[7px] text-[12px]"
            >
              confirm (must be live)
            </button>
          ) : (
            <span className="text-[12px] text-[#22c55e]">confirmed</span>
          )}
          <button
            onClick={onRemove}
            className="bg-[#1a1a1a] hover:bg-[#1a0a0a] text-[#ef4444] border border-[#ef444444] rounded px-3 py-[7px] text-[12px]"
          >
            remove
          </button>
        </div>
      </div>
      <div className="text-[13px] text-[#555]">
        {ch.confirmed ? 'auto-clipping active' : 'not confirmed — confirm when stream is live'}
      </div>
    </div>
  )
}
