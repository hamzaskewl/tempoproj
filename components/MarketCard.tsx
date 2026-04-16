'use client'

import { useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { BetForm } from './BetForm'
import { ClaimButton } from './ClaimButton'
import { useClientProgram } from './useClientProgram'
import { fetchPosition, type ClientPosition } from '@/app/(dashboard)/markets/lib/program'
import { OddsBar } from '@/app/(dashboard)/markets/components/OddsBar'
import { Countdown } from '@/app/(dashboard)/markets/components/Countdown'
import { ResolutionBadge } from '@/app/(dashboard)/markets/components/ResolutionBadge'
import type { MarketRow } from '@/app/(dashboard)/markets/lib/types'

function formatUsdc(raw: string): number {
  try {
    return Number(BigInt(raw)) / 1_000_000
  } catch {
    return 0
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

export function MarketCard({ market, compact }: { market: MarketRow; compact?: boolean }) {
  const [position, setPosition] = useState<ClientPosition | null>(null)
  const { publicKey } = useWallet()
  const program = useClientProgram()

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

  const yesNum = formatUsdc(market.totalYes)
  const noNum = formatUsdc(market.totalNo)
  const total = yesNum + noNum
  const yesPct = total > 0 ? Math.round((yesNum / total) * 100) : 50
  const moodColor = MOOD_COLOR[market.mood] || '#666'
  const isResolved = market.state !== 'open'
  const hasClaimable = isResolved && position && !position.claimed &&
    (position.yesAmount > 0n || position.noAmount > 0n)

  return (
    <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-lg p-4 hover:border-[#222] transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-[12px] uppercase tracking-wide font-bold px-2 py-[2px] rounded"
            style={{ color: moodColor, backgroundColor: `${moodColor}18`, border: `1px solid ${moodColor}33` }}
          >
            {market.mood}
          </span>
          {!compact && (
            <span className="text-[12px] text-[#444]">{market.channel}</span>
          )}
        </div>
        {isResolved ? (
          <ResolutionBadge state={market.state} />
        ) : (
          <Countdown windowEnd={market.windowEnd} />
        )}
      </div>

      <div className="mb-3">
        <OddsBar yesPct={yesPct} />
      </div>

      <div className="flex items-center justify-between text-[11px] mb-3">
        <div>
          <span className="text-[#555]">YES </span>
          <span className="text-[#22c55e] font-mono">${yesNum.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-[#555]">NO </span>
          <span className="text-[#dc2626] font-mono">${noNum.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-[#555]">Pool </span>
          <span className="text-[#888] font-mono">${total.toFixed(2)}</span>
        </div>
      </div>

      {!isResolved && (
        <BetForm market={market} />
      )}

      {hasClaimable && position && (
        <ClaimButton market={market} position={position} />
      )}

      {isResolved && !hasClaimable && (
        <div className="text-[11px] text-[#333] text-center py-2">
          {market.state === 'yes' ? 'Mood fired — resolved YES' : 'No spike — resolved NO'}
        </div>
      )}
    </div>
  )
}
