'use client'

import { useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { BetForm } from './BetForm'
import { ClaimButton } from './ClaimButton'
import { useClientProgram } from './useClientProgram'
import { fetchPosition, type ClientPosition } from '@/app/(dashboard)/markets/lib/program'
import type { MarketRow } from '@/app/(dashboard)/markets/lib/types'

function formatCountdown(secs: number): string {
  if (secs <= 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatUsdc(raw: string): string {
  try {
    const n = Number(BigInt(raw)) / 1_000_000
    return n.toFixed(2)
  } catch {
    return '0.00'
  }
}

const MOOD_COLOR: Record<string, string> = {
  hype: '#f59e0b',
  funny: '#eab308',
  rage: '#dc2626',
  clutch: '#22c55e',
  awkward: '#a855f7',
  wholesome: '#ec4899',
  drama: '#8b5cf6',
  shock: '#06b6d4',
  sad: '#64748b',
}

export function MarketCard({ market }: { market: MarketRow }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [betOpen, setBetOpen] = useState(false)
  const [position, setPosition] = useState<ClientPosition | null>(null)
  const { publicKey } = useWallet()
  const program = useClientProgram()

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!program || !publicKey || market.state === 'open') {
      setPosition(null)
      return
    }
    let cancelled = false
    fetchPosition(program, new PublicKey(market.pda), publicKey)
      .then((p) => { if (!cancelled) setPosition(p) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [program, publicKey, market.pda, market.state])

  const secsLeft = Math.max(0, market.windowEnd - now)
  const yesNum = Number(formatUsdc(market.totalYes))
  const noNum = Number(formatUsdc(market.totalNo))
  const total = yesNum + noNum
  const yesPct = total > 0 ? Math.round((yesNum / total) * 100) : 50
  const moodColor = MOOD_COLOR[market.mood] || '#666'
  const isResolved = market.state !== 'open'
  const hasClaimable = isResolved && position && !position.claimed && (position.yesAmount > 0n || position.noAmount > 0n)

  return (
    <div className="bg-[#111] border border-[#161616] rounded-md p-5 hover:border-[#222] transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-[15px] font-semibold text-white">{market.channel}</div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="text-[11px] uppercase tracking-wide font-semibold px-2 py-[2px] rounded"
              style={{ color: moodColor, backgroundColor: `${moodColor}22`, border: `1px solid ${moodColor}44` }}
            >
              {market.mood}
            </span>
            {isResolved ? (
              <span className={`text-[11px] uppercase tracking-wide font-semibold ${market.state === 'yes' ? 'text-[#22c55e]' : 'text-[#64748b]'}`}>
                {market.state === 'yes' ? 'Resolved YES' : 'Resolved NO'}
              </span>
            ) : null}
          </div>
        </div>
        {!isResolved && (
          <div className="text-right">
            <div className="text-[11px] text-[#555] uppercase tracking-wide">Ends in</div>
            <div className="font-mono text-[15px] text-[#ddd]">{formatCountdown(secsLeft)}</div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-[6px] bg-[#1a1a1a] rounded-full overflow-hidden">
          <div className="h-full bg-[#22c55e]" style={{ width: `${yesPct}%` }} />
        </div>
        <span className="text-[12px] text-[#888] font-mono w-[44px] text-right">{yesPct}%</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[12px] mb-4">
        <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded px-3 py-2">
          <div className="text-[#555] uppercase tracking-wide text-[10px]">YES pool</div>
          <div className="text-[#22c55e] font-mono text-[14px] mt-[2px]">${yesNum.toFixed(2)}</div>
        </div>
        <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded px-3 py-2">
          <div className="text-[#555] uppercase tracking-wide text-[10px]">NO pool</div>
          <div className="text-[#dc2626] font-mono text-[14px] mt-[2px]">${noNum.toFixed(2)}</div>
        </div>
      </div>

      {!isResolved && secsLeft > 0 && (
        <button
          onClick={() => setBetOpen(true)}
          className="w-full text-[13px] px-4 py-2 bg-[#1a1a1a] hover:bg-[#222] text-white border border-[#333] rounded transition-colors"
        >
          Bet
        </button>
      )}
      {hasClaimable && position && (
        <ClaimButton market={market} position={position} />
      )}

      {betOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setBetOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <BetForm market={market} onClose={() => setBetOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
