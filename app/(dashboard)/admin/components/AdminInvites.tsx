'use client'

import { useState } from 'react'
import { Th } from '@/components/TableHeader'
import type { InviteCode } from '@/lib/types'

const USES_PRESETS = [1, 5, 10, 25, 100]

interface AdminInvitesProps {
  invites: InviteCode[]
  onCreateInvite: (label: string, maxUses: number) => void
  onDeleteInvite: (code: string) => void
  copiedCode: string | null
  setCopiedCode: (code: string | null) => void
}

export function AdminInvites({ invites, onCreateInvite, onDeleteInvite, copiedCode, setCopiedCode }: AdminInvitesProps) {
  const [inviteLabel, setInviteLabel] = useState('')
  const [selectedUses, setSelectedUses] = useState<number>(5)
  const [customUses, setCustomUses] = useState('')

  function handleCreate() {
    const maxUses = customUses ? Math.min(parseInt(customUses, 10) || 5, 10000) : selectedUses
    onCreateInvite(inviteLabel.trim(), maxUses)
    setInviteLabel('')
    setCustomUses('')
    setSelectedUses(5)
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  return (
    <div className="bg-[#111] border border-[#1a1a1a] rounded-lg p-6">
      <div className="text-[12px] uppercase tracking-wider text-[#555] mb-4">invite codes</div>
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={inviteLabel}
          onChange={(e) => setInviteLabel(e.target.value)}
          placeholder="label (optional)"
          className="flex-1 min-w-[140px] bg-[#0a0a0a] border border-[#1a1a1a] focus:border-[#333] rounded px-[18px] py-[12px] text-white text-[14px] outline-none"
        />
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[12px] text-[#444] whitespace-nowrap">uses:</span>
          {USES_PRESETS.map((n) => (
            <button
              key={n}
              onClick={() => {
                setSelectedUses(n)
                setCustomUses('')
              }}
              className={`bg-[#0e0e0e] border rounded text-[13px] px-2 py-[7px] min-w-[28px] text-center ${
                selectedUses === n && !customUses
                  ? 'border-[#9146ff] text-[#9146ff] bg-[#1a0a2a]'
                  : 'border-[#222] text-[#555] hover:border-[#444] hover:text-[#999]'
              }`}
            >
              {n}
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={10000}
            value={customUses}
            onChange={(e) => setCustomUses(e.target.value)}
            placeholder="#"
            className="w-12 bg-[#0e0e0e] border border-[#222] rounded text-white text-[13px] px-[8px] py-1 text-center outline-none"
          />
        </div>
        <button
          onClick={handleCreate}
          className="btn-purple text-[14px] px-5 py-[12px]"
        >
          generate
        </button>
      </div>
      <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr>
              <Th>code</Th>
              <Th>label</Th>
              <Th>uses</Th>
              <Th>used by</Th>
              <Th>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-[#222] text-center p-6">
                  no invite codes yet
                </td>
              </tr>
            ) : (
              invites.map((i) => {
                const exhausted = i.useCount >= i.maxUses
                const pct = Math.min(100, (i.useCount / i.maxUses) * 100)
                return (
                  <tr key={i.code} className="hover:bg-[#0e0e0e]">
                    <td className="py-[12px] px-3 border-b border-[#111] tracking-[1px] text-[#9146ff] font-medium">
                      {i.code}
                    </td>
                    <td className="py-[12px] px-3 border-b border-[#111] text-[#999]">{i.label || '-'}</td>
                    <td className="py-[12px] px-3 border-b border-[#111] text-[#999]">
                      <div className="flex items-center gap-1">
                        <div className="h-[3px] rounded bg-[#222] flex-1 overflow-hidden">
                          <div
                            className={`h-full rounded ${exhausted ? 'bg-[#ef4444]' : 'bg-[#9146ff]'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[12px] text-[#555] whitespace-nowrap">
                          {i.useCount}/{i.maxUses}
                        </span>
                      </div>
                      <span
                        className={`inline-block px-2 py-[2px] rounded text-[12px] mt-1 ${
                          exhausted ? 'bg-[#111] text-[#333]' : 'bg-[#0a1a0a] text-[#22c55e]'
                        }`}
                      >
                        {exhausted ? 'exhausted' : 'available'}
                      </span>
                    </td>
                    <td className="py-[12px] px-3 border-b border-[#111] text-[#999]">
                      {i.uses && i.uses.length > 0 ? (
                        <div className="text-[12px] text-[#555] leading-[1.6]">
                          {i.uses.map((u, idx) => (
                            <span key={idx} className="text-[#888]">
                              {u.usedByName}
                              {idx < i.uses!.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[#333]">&mdash;</span>
                      )}
                    </td>
                    <td className="py-[12px] px-3 border-b border-[#111] flex gap-1">
                      {!exhausted && (
                        <button
                          onClick={() => copyCode(i.code)}
                          className={`border rounded text-[12px] px-2 py-[2px] ${
                            copiedCode === i.code
                              ? 'border-[#22c55e] text-[#22c55e]'
                              : 'border-[#222] text-[#555] hover:border-[#444] hover:text-[#999]'
                          }`}
                        >
                          {copiedCode === i.code ? 'copied' : 'copy'}
                        </button>
                      )}
                      <button
                        onClick={() => onDeleteInvite(i.code)}
                        className="border border-[#ef444444] text-[#ef4444] rounded text-[12px] px-2 py-[2px] hover:bg-[#1a0a0a]"
                      >
                        del
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
