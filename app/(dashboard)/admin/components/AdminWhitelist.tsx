import type { WhitelistEntry } from '@/lib/types'

interface AdminWhitelistProps {
  whitelist: WhitelistEntry[]
  whitelistInput: string
  setWhitelistInput: (v: string) => void
  onAddWhitelist: () => void
  onRemoveWhitelist: (username: string) => void
}

export function AdminWhitelist({
  whitelist, whitelistInput, setWhitelistInput, onAddWhitelist, onRemoveWhitelist,
}: AdminWhitelistProps) {
  return (
    <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-6">
      <div className="text-[12px] uppercase tracking-wider text-[#555] mb-4">whitelist</div>
      <div className="flex gap-2 mb-4 flex-col md:flex-row">
        <input
          type="text"
          value={whitelistInput}
          onChange={(e) => setWhitelistInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAddWhitelist()}
          placeholder="twitch username"
          className="flex-1 bg-[#0a0a0a] border border-[#1a1a1a] focus:border-[#333] rounded px-[18px] py-[12px] text-white text-[14px] outline-none"
        />
        <button
          onClick={onAddWhitelist}
          className="bg-[#9146ff] hover:bg-[#7c3aed] text-white text-[14px] font-semibold px-5 py-[12px] rounded"
        >
          add
        </button>
      </div>
      <div className="text-[13px] text-[#555]">
        {whitelist.length === 0 ? (
          <div className="text-[#222] text-center py-3">no whitelisted users</div>
        ) : (
          whitelist.map((w) => (
            <div
              key={w.username}
              className="flex justify-between items-center px-3 py-2 border-b border-[#1a1a1a] last:border-b-0"
            >
              <span className="text-white">{w.username}</span>
              <button
                onClick={() => onRemoveWhitelist(w.username)}
                className="border border-[#ef444444] text-[#ef4444] rounded text-[12px] px-2 py-[2px] hover:bg-[#1a0a0a]"
              >
                remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
