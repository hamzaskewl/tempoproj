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
  moodToU8,
  type ConfigAccount,
} from '@/app/(dashboard)/markets/lib/program'
import type { MarketRow } from '@/app/(dashboard)/markets/lib/types'
import { useClientProgram } from './useClientProgram'

type Side = 'YES' | 'NO'
type Status = 'idle' | 'pending' | 'confirmed' | 'failed'

export function BetForm({ market, onClose }: { market: MarketRow; onClose: () => void }) {
  const { publicKey, sendTransaction } = useWallet()
  const { connection } = useConnection()
  const program = useClientProgram()

  const [amount, setAmount] = useState('1.00')
  const [side, setSide] = useState<Side>('YES')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [config, setConfig] = useState<ConfigAccount | null>(null)
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null)

  useEffect(() => {
    if (!program) return
    let cancelled = false
    fetchConfig(program)
      .then((c) => { if (!cancelled) setConfig(c) })
      .catch((e) => { if (!cancelled) setMessage(`Config load failed: ${e.message}`) })
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

  const canSubmit =
    !!program &&
    !!publicKey &&
    !!config &&
    status !== 'pending' &&
    Number(amount) > 0 &&
    (usdcBalance == null || Number(amount) <= usdcBalance)

  async function submit() {
    if (!program || !publicKey || !config) return
    setStatus('pending')
    setMessage(null)

    try {
      const marketPda = new PublicKey(market.pda)
      const [configPda] = findConfigPda()
      const [escrowPda] = findEscrowPda(marketPda)
      const [positionPda] = findPositionPda(marketPda, publicKey)
      const userUsdc = getAssociatedTokenAddressSync(config.usdcMint, publicKey)

      const amountLamports = new BN(Math.floor(Number(amount) * 1_000_000))
      const sideByte = side === 'YES' ? 0 : 1
      const moodU8 = moodToU8(market.mood)
      void moodU8 // mood is encoded in market PDA already; included here for sanity

      const tx = new Transaction()

      // Ensure user USDC ATA exists.
      const ataInfo = await connection.getAccountInfo(userUsdc)
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            userUsdc,
            publicKey,
            config.usdcMint,
          ),
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
      setMessage(`Sent: ${sig.slice(0, 12)}…`)
      await connection.confirmTransaction(sig, 'confirmed')
      setStatus('confirmed')
      setMessage(`Confirmed: ${sig.slice(0, 12)}…`)
      setTimeout(onClose, 1200)
    } catch (err: any) {
      console.error('[bet] failed:', err)
      setStatus('failed')
      setMessage(err?.message || 'Transaction failed')
    }
  }

  return (
    <div className="bg-[#0e0e0e] border border-[#222] rounded-md p-6 w-[360px] max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-semibold text-white">{market.channel}</div>
          <div className="text-[11px] uppercase tracking-wide text-[#888]">{market.mood} market</div>
        </div>
        <button onClick={onClose} className="text-[#555] hover:text-white text-[14px]">✕</button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setSide('YES')}
          className={`text-[13px] py-2 rounded border transition-colors ${
            side === 'YES'
              ? 'bg-[#22c55e22] border-[#22c55e] text-[#22c55e]'
              : 'bg-[#111] border-[#222] text-[#666] hover:border-[#333]'
          }`}
        >
          YES
        </button>
        <button
          onClick={() => setSide('NO')}
          className={`text-[13px] py-2 rounded border transition-colors ${
            side === 'NO'
              ? 'bg-[#dc262622] border-[#dc2626] text-[#dc2626]'
              : 'bg-[#111] border-[#222] text-[#666] hover:border-[#333]'
          }`}
        >
          NO
        </button>
      </div>

      <label className="block text-[11px] uppercase tracking-wide text-[#555] mb-1">Amount (USDC)</label>
      <input
        type="number"
        step="0.01"
        min="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full bg-[#111] border border-[#222] rounded px-3 py-2 text-[14px] text-white font-mono focus:outline-none focus:border-[#333]"
      />
      <div className="text-[11px] text-[#555] mt-1">
        Balance: {usdcBalance == null ? '…' : `$${usdcBalance.toFixed(2)}`}
      </div>

      <button
        disabled={!canSubmit}
        onClick={submit}
        className="w-full mt-4 text-[13px] py-2 bg-[#1a1a1a] hover:bg-[#222] disabled:opacity-40 disabled:cursor-not-allowed text-white border border-[#333] rounded transition-colors"
      >
        {status === 'pending' ? 'Sending…' : `Place ${side} bet`}
      </button>

      {message && (
        <div className={`text-[11px] mt-3 font-mono ${status === 'failed' ? 'text-[#dc2626]' : status === 'confirmed' ? 'text-[#22c55e]' : 'text-[#888]'}`}>
          {message}
        </div>
      )}
    </div>
  )
}
