import type { Metadata } from 'next'
import './globals.css'
import { WalletProviderClient } from '@/components/WalletProviderClient'

export const metadata: Metadata = {
  title: 'clippy — real-time twitch stream intelligence',
  description:
    'Real-time Twitch stream intelligence: detects chat spikes, classifies moments with AI, auto-clips highlights.',
  icons: {
    icon: '/logo.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProviderClient>{children}</WalletProviderClient>
      </body>
    </html>
  )
}
