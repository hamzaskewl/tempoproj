'use client'

import { useEffect, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import bs58 from 'bs58'

function truncate(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

export function ConnectWalletButton() {
  const { publicKey, signMessage, disconnect, connected } = useWallet()
  const { setVisible } = useWalletModal()
  const linkedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!connected || !publicKey || !signMessage) return
    const address = publicKey.toBase58()
    if (linkedRef.current === address) return

    let cancelled = false
    ;(async () => {
      try {
        const nonceRes = await fetch('/api/wallets/link', { method: 'GET', credentials: 'include' })
        if (!nonceRes.ok) return
        const { nonce } = await nonceRes.json()
        if (!nonce || cancelled) return

        const message = `Link Phantom wallet to clippy session\n\nwallet: ${address}\nnonce: ${nonce}`
        const sigBytes = await signMessage(new TextEncoder().encode(message))
        const signature = bs58.encode(sigBytes)

        const linkRes = await fetch('/api/wallets/link', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: address, signature, message }),
        })
        if (linkRes.ok && !cancelled) {
          linkedRef.current = address
        }
      } catch (err) {
        console.error('[wallet-link] failed:', err)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [connected, publicKey, signMessage])

  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="text-[13px] px-4 py-2 bg-[#1a1a1a] hover:bg-[#222] text-white border border-[#333] rounded transition-colors"
      >
        Connect Phantom
      </button>
    )
  }

  return (
    <button
      onClick={() => disconnect()}
      className="text-[13px] px-4 py-2 bg-[#111] hover:bg-[#181818] text-[#22c55e] border border-[#22c55e44] rounded transition-colors font-mono"
      title="Click to disconnect"
    >
      {truncate(publicKey.toBase58())}
    </button>
  )
}
