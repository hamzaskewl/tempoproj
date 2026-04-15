'use client'

import { useMemo } from 'react'
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react'
import { Program } from '@coral-xyz/anchor'
import { getClientProgram } from '@/app/(dashboard)/markets/lib/program'

// Returns an Anchor Program bound to the connected wallet, or null if no wallet.
export function useClientProgram(): Program | null {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()
  return useMemo(() => {
    if (!wallet) return null
    try {
      return getClientProgram(connection, wallet as any)
    } catch (err) {
      console.error('[program] init failed:', err)
      return null
    }
  }, [connection, wallet])
}
