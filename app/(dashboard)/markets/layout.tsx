import type { ReactNode } from 'react'
import { WalletProviderClient } from './components/WalletProviderClient'

export default function MarketsLayout({ children }: { children: ReactNode }) {
  return <WalletProviderClient>{children}</WalletProviderClient>
}
