'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction } from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { Topbar } from '@/components/Topbar'
import { ConnectWalletButton } from '@/components/ConnectWalletButton'
import { useClientProgram } from '@/components/useClientProgram'
import { ResolutionBadge } from '@/app/(dashboard)/markets/components/ResolutionBadge'
import {
  fetchConfig,
  findConfigPda,
  findEscrowPda,
  findPositionPda,
  getClientProgramId,
  type ConfigAccount,
} from '@/app/(dashboard)/markets/lib/program'

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

interface PositionRow {
  marketPda: string
  channel: string
  mood: string
  state: string
  yesAmount: bigint
  noAmount: bigint
  claimed: boolean
  totalYes: bigint
  totalNo: bigint
  windowEnd: number
}

function computePayout(pos: PositionRow, feeBps: number): bigint {
  const won = pos.state === 'yes'
  const stake = won ? pos.yesAmount : pos.noAmount
  const winPool = won ? pos.totalYes : pos.totalNo
  const losePool = won ? pos.totalNo : pos.totalYes
  if (stake === 0n || winPool === 0n) return 0n
  const fee = (losePool * BigInt(feeBps)) / 10_000n
  return stake + (stake * (losePool - fee)) / winPool
}

export function PortfolioView() {
  const { publicKey, sendTransaction, connected } = useWallet()
  const { connection } = useConnection()
  const program = useClientProgram()
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [config, setConfig] = useState<ConfigAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [claimingPda, setClaimingPda] = useState<string | null>(null)

  useEffect(() => {
    if (!program) return
    let cancelled = false
    fetchConfig(program)
      .then((c) => { if (!cancelled) setConfig(c) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [program])

  useEffect(() => {
    if (!program || !publicKey) {
      setPositions([])
      setLoading(false)
      return
    }
    let cancelled = false
    loadPositions()
    async function loadPositions() {
      try {
        const programId = getClientProgramId()
        const positionAccounts = await connection.getProgramAccounts(programId, {
          filters: [
            { memcmp: { offset: 8, bytes: publicKey!.toBase58() } },
          ],
        })

        const marketsRes = await fetch('/api/markets')
        const allMarkets = await marketsRes.json()
        const marketMap = new Map<string, any>()
        for (const m of allMarkets) marketMap.set(m.pda, m)

        const rows: PositionRow[] = []
        for (const acct of positionAccounts) {
          try {
            const raw = (program!.coder.accounts as any).decode('position', acct.account.data)
            const marketPda = acct.pubkey.toBase58()
            const pdaKey = findPositionPda(acct.pubkey, publicKey!)[0].toBase58()
            void pdaKey

            for (const [mPda, mData] of marketMap) {
              const [posPda] = findPositionPda(new PublicKey(mPda), publicKey!)
              if (posPda.equals(acct.pubkey)) {
                rows.push({
                  marketPda: mPda,
                  channel: mData.channel,
                  mood: mData.mood,
                  state: mData.state,
                  yesAmount: BigInt(raw.yesAmount?.toString() || '0'),
                  noAmount: BigInt(raw.noAmount?.toString() || '0'),
                  claimed: !!raw.claimed,
                  totalYes: BigInt(mData.totalYes),
                  totalNo: BigInt(mData.totalNo),
                  windowEnd: mData.windowEnd,
                })
                break
              }
            }
          } catch {}
        }

        if (!cancelled) setPositions(rows)
      } catch (err) {
        console.error('[portfolio] load failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    return () => { cancelled = true }
  }, [program, publicKey, connection])

  async function claim(pos: PositionRow) {
    if (!program || !publicKey || !config) return
    setClaimingPda(pos.marketPda)
    try {
      const marketPda = new PublicKey(pos.marketPda)
      const [configPda] = findConfigPda()
      const [escrowPda] = findEscrowPda(marketPda)
      const [positionPda] = findPositionPda(marketPda, publicKey)
      const userUsdc = getAssociatedTokenAddressSync(config.usdcMint, publicKey)
      const feeRecipientAta = getAssociatedTokenAddressSync(config.usdcMint, config.feeRecipient, true)

      const ix = await (program.methods as any)
        .claim()
        .accounts({
          config: configPda,
          market: marketPda,
          escrow: escrowPda,
          position: positionPda,
          user: publicKey,
          userUsdc,
          feeRecipientAta,
          usdcMint: config.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction()
      const tx = new Transaction().add(ix)
      const sig = await sendTransaction(tx, connection)
      await connection.confirmTransaction(sig, 'confirmed')
      setPositions((prev) =>
        prev.map((p) => p.marketPda === pos.marketPda ? { ...p, claimed: true } : p)
      )
    } catch (err) {
      console.error('[claim] failed:', err)
    } finally {
      setClaimingPda(null)
    }
  }

  const claimable = positions.filter((p) => {
    if (p.claimed || p.state === 'open') return false
    const won = p.state === 'yes' ? p.yesAmount > 0n : p.noAmount > 0n
    return won
  })
  const other = positions.filter((p) => !claimable.includes(p))

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Topbar showLogout />

      <div className="max-w-[800px] mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[22px] font-semibold text-white">Portfolio</h1>
            <p className="text-[13px] text-[#555] mt-1">Your market positions and claimable winnings.</p>
          </div>
          <ConnectWalletButton />
        </div>

        {!connected && (
          <div className="text-[13px] text-[#555] py-16 text-center border border-dashed border-[#222] rounded-md">
            Connect your wallet to view positions.
          </div>
        )}

        {connected && loading && (
          <div className="text-[13px] text-[#444] py-16 text-center">Loading positions...</div>
        )}

        {connected && !loading && positions.length === 0 && (
          <div className="text-[13px] text-[#555] py-16 text-center border border-dashed border-[#222] rounded-md">
            No positions yet. <Link href="/markets" className="text-[#9146ff] hover:underline">Place a bet</Link> to get started.
          </div>
        )}

        {claimable.length > 0 && (
          <div className="mb-8">
            <div className="text-[11px] uppercase tracking-wider text-[#22c55e] font-semibold mb-3">
              Claimable
            </div>
            <div className="space-y-2">
              {claimable.map((pos) => {
                const payout = config ? computePayout(pos, config.feeBps) : 0n
                const payoutUsdc = (Number(payout) / 1_000_000).toFixed(2)
                const moodColor = MOOD_COLOR[pos.mood] || '#666'
                return (
                  <div key={pos.marketPda} className="flex items-center justify-between bg-[#0e1e14] border border-[#22c55e22] rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/markets/${pos.channel}`} className="text-[14px] text-white hover:text-[#9146ff]">
                        {pos.channel}
                      </Link>
                      <span
                        className="text-[10px] uppercase tracking-wide font-semibold px-[6px] py-[1px] rounded"
                        style={{ color: moodColor, backgroundColor: `${moodColor}18` }}
                      >
                        {pos.mood}
                      </span>
                      <ResolutionBadge state={pos.state} />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[14px] font-mono text-[#22c55e]">${payoutUsdc}</span>
                      <button
                        onClick={() => claim(pos)}
                        disabled={claimingPda === pos.marketPda}
                        className="text-[12px] font-semibold px-3 py-[4px] bg-[#22c55e22] border border-[#22c55e55] text-[#22c55e] rounded hover:bg-[#22c55e33] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {claimingPda === pos.marketPda ? 'Claiming...' : 'Claim'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {other.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#555] font-semibold mb-3">
              All Positions
            </div>
            <div className="space-y-2">
              {other.map((pos) => {
                const stakeUsdc = (Number(pos.yesAmount + pos.noAmount) / 1_000_000).toFixed(2)
                const side = pos.yesAmount > pos.noAmount ? 'YES' : 'NO'
                const moodColor = MOOD_COLOR[pos.mood] || '#666'
                return (
                  <div key={pos.marketPda} className="flex items-center justify-between bg-[#0e0e0e] border border-[#1a1a1a] rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/markets/${pos.channel}`} className="text-[14px] text-white hover:text-[#9146ff]">
                        {pos.channel}
                      </Link>
                      <span
                        className="text-[10px] uppercase tracking-wide font-semibold px-[6px] py-[1px] rounded"
                        style={{ color: moodColor, backgroundColor: `${moodColor}18` }}
                      >
                        {pos.mood}
                      </span>
                      <ResolutionBadge state={pos.state} />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-semibold ${side === 'YES' ? 'text-[#22c55e]' : 'text-[#dc2626]'}`}>
                        {side}
                      </span>
                      <span className="text-[13px] font-mono text-[#888]">${stakeUsdc}</span>
                      {pos.claimed && (
                        <span className="text-[10px] text-[#555]">claimed</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
