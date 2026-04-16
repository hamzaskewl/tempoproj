'use client'

import { useEffect, useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  getAccount,
} from '@solana/spl-token'
import { BN } from '@coral-xyz/anchor'
import {
  fetchConfig,
  findConfigPda,
  findEscrowPda,
  findPositionPda,
  type ConfigAccount,
} from '@/app/(dashboard)/markets/lib/program'
import type { MarketRow } from '@/app/(dashboard)/markets/lib/types'
import { useClientProgram } from './useClientProgram'

type Side = 'YES' | 'NO'
type Status = 'idle' | 'pending' | 'confirmed' | 'failed'

export function BetForm({ market }: { market: MarketRow }) {
  const { publicKey, sendTransaction, connected } = useWallet()
  const { connection } = useConnection()
  const program = useClientProgram()

  const [amount, setAmount] = useState('1')
  const [side, setSide] = useState<Side | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [config, setConfig] = useState<ConfigAccount | null>(null)
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null)

  useEffect(() => {
    if (!program) return
    let cancelled = false
    fetchConfig(program)
      .then((c) => { if (!cancelled) setConfig(c) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [program])

  useEffect(() => {
    if (!config || !publicKey) return
    let cancelled = false
    const ata = getAssociatedTokenAddressSync(config.usdcMint, publicKey)
    getAccount(connection, ata)
      .then((acct) => { if (!cancelled) setUsdcBalance(Number(acct.amount) / 1_000_000) })
      .catch(() => { if (!cancelled) setUsdcBalance(0) })
    return () => { cancelled = true }
  }, [config, publicKey, connection])

  if (!connected) {
    return (
      <div className="text-[11px] text-[#444] text-center py-2 border border-dashed border-[#222] rounded">
        Connect wallet to bet
      </div>
    )
  }

  const parsedAmount = Number(amount)
  const tooLow = parsedAmount <= 0
  const tooHigh = usdcBalance != null && parsedAmount > usdcBalance
  const canSubmit = !!program && !!publicKey && !!config && !!side && status !== 'pending' && !tooLow && !tooHigh

  async function submit() {
    if (!program || !publicKey || !config || !side) return
    setStatus('pending')
    setMessage(null)

    try {
      const marketPda = new PublicKey(market.pda)
      const [configPda] = findConfigPda()
      const [escrowPda] = findEscrowPda(marketPda)
      const [positionPda] = findPositionPda(marketPda, publicKey)
      const userUsdc = getAssociatedTokenAddressSync(config.usdcMint, publicKey)

      const amountLamports = new BN(Math.floor(parsedAmount * 1_000_000))
      const sideByte = side === 'YES' ? 0 : 1

      const tx = new Transaction()

      const ataInfo = await connection.getAccountInfo(userUsdc)
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(publicKey, userUsdc, publicKey, config.usdcMint),
        )
      }

      const betIx = await (program.methods as any)
        .placeBet(sideByte, amountLamports)
        .accounts({
          config: configPda,
          market: marketPda,
          escrow: escrowPda,
          position: positionPda,
          user: publicKey,
          userUsdc,
          usdcMint: config.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
      tx.add(betIx)

      const sig = await sendTransaction(tx, connection)
      await connection.confirmTransaction(sig, 'confirmed')
      setStatus('confirmed')
      setMessage(`Bet placed!`)
      setSide(null)
      setTimeout(() => { setStatus('idle'); setMessage(null) }, 2000)
    } catch (err: any) {
      console.error('[bet] failed:', err)
      setStatus('failed')
      setMessage(err?.message?.slice(0, 80) || 'Transaction failed')
    }
  }

  return (
    <div>
      {/* Side selector + amount + submit in compact layout */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSide('YES')}
          className={`flex-1 text-[12px] font-semibold py-[6px] rounded border transition-colors ${
            side === 'YES'
              ? 'bg-[#22c55e18] border-[#22c55e55] text-[#22c55e]'
              : 'bg-[#111] border-[#1a1a1a] text-[#555] hover:border-[#333] hover:text-[#888]'
          }`}
        >
          YES
        </button>
        <button
          onClick={() => setSide('NO')}
          className={`flex-1 text-[12px] font-semibold py-[6px] rounded border transition-colors ${
            side === 'NO'
              ? 'bg-[#dc262618] border-[#dc262655] text-[#dc2626]'
              : 'bg-[#111] border-[#1a1a1a] text-[#555] hover:border-[#333] hover:text-[#888]'
          }`}
        >
          NO
        </button>
      </div>

      {side && (
        <div className="mt-2 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-[#555]">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-[#111] border border-[#1a1a1a] rounded pl-5 pr-2 py-[6px] text-[13px] text-white font-mono focus:outline-none focus:border-[#333]"
            />
          </div>
          <button
            disabled={!canSubmit}
            onClick={submit}
            className={`text-[12px] font-semibold px-4 py-[6px] rounded border transition-colors ${
              side === 'YES'
                ? 'bg-[#22c55e22] border-[#22c55e55] text-[#22c55e] hover:bg-[#22c55e33] disabled:opacity-30'
                : 'bg-[#dc262622] border-[#dc262655] text-[#dc2626] hover:bg-[#dc262633] disabled:opacity-30'
            } disabled:cursor-not-allowed`}
          >
            {status === 'pending' ? '...' : 'Bet'}
          </button>
        </div>
      )}

      {side && usdcBalance != null && (
        <div className="text-[10px] text-[#444] mt-1">
          Balance: ${usdcBalance.toFixed(2)} USDC
          {tooHigh && <span className="text-[#dc2626] ml-1">— insufficient</span>}
        </div>
      )}

      {message && (
        <div className={`text-[10px] mt-1 font-mono ${status === 'failed' ? 'text-[#dc2626]' : 'text-[#22c55e]'}`}>
          {message}
        </div>
      )}
    </div>
  )
}
