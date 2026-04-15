'use client'

import { useEffect, useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction } from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  fetchConfig,
  findConfigPda,
  findEscrowPda,
  findPositionPda,
  type ConfigAccount,
  type ClientPosition,
} from '@/app/(dashboard)/markets/lib/program'
import type { MarketRow } from '@/app/(dashboard)/markets/lib/types'
import { useClientProgram } from './useClientProgram'

// Mirror of the on-chain parimutuel math from programs/clippy_market.
function computePayout(
  market: MarketRow,
  position: ClientPosition,
  feeBps: number,
): bigint {
  const totalYes = BigInt(market.totalYes)
  const totalNo = BigInt(market.totalNo)
  const yesAmt = position.yesAmount
  const noAmt = position.noAmount

  const won = market.state === 'yes'
  const winningStake = won ? yesAmt : noAmt
  const winningPool = won ? totalYes : totalNo
  const losingPool = won ? totalNo : totalYes

  if (winningStake === 0n) return 0n
  if (winningPool === 0n) return yesAmt + noAmt // refund
  const fee = (losingPool * BigInt(feeBps)) / 10_000n
  const netLoser = losingPool - fee
  return winningStake + (winningStake * netLoser) / winningPool
}

type Status = 'idle' | 'pending' | 'confirmed' | 'failed'

export function ClaimButton({
  market,
  position,
}: {
  market: MarketRow
  position: ClientPosition
}) {
  const { publicKey, sendTransaction } = useWallet()
  const { connection } = useConnection()
  const program = useClientProgram()

  const [config, setConfig] = useState<ConfigAccount | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!program) return
    let cancelled = false
    fetchConfig(program).then((c) => { if (!cancelled) setConfig(c) }).catch(() => {})
    return () => { cancelled = true }
  }, [program])

  const payout = config ? computePayout(market, position, config.feeBps) : 0n
  const payoutUsdc = (Number(payout) / 1_000_000).toFixed(2)

  async function claim() {
    if (!program || !publicKey || !config) return
    setStatus('pending')
    setMessage(null)
    try {
      const marketPda = new PublicKey(market.pda)
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
      setMessage(`Sent: ${sig.slice(0, 12)}…`)
      await connection.confirmTransaction(sig, 'confirmed')
      setStatus('confirmed')
      setMessage(`Claimed ${payoutUsdc} USDC`)
    } catch (err: any) {
      console.error('[claim] failed:', err)
      setStatus('failed')
      setMessage(err?.message || 'Claim failed')
    }
  }

  const disabled = position.claimed || status === 'pending' || !config

  return (
    <div className="mt-2">
      <button
        disabled={disabled}
        onClick={claim}
        className="w-full text-[13px] py-2 bg-[#0e1e14] hover:bg-[#12281a] disabled:opacity-40 disabled:cursor-not-allowed text-[#22c55e] border border-[#22c55e44] rounded transition-colors"
      >
        {position.claimed ? 'Claimed' : status === 'pending' ? 'Claiming…' : `Claim $${payoutUsdc}`}
      </button>
      {message && (
        <div className={`text-[11px] mt-2 font-mono ${status === 'failed' ? 'text-[#dc2626]' : 'text-[#888]'}`}>
          {message}
        </div>
      )}
    </div>
  )
}
