'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import { DiscordLink } from './DiscordLink'
import { StatusPill } from './StatusDot'

export interface TopbarProps {
  /** Optional live status pill on the right (home/dashboard show this). */
  status?: { live: boolean; label: string }
  /** Show the logout button (auth-gated pages). When false, shows login link instead. */
  showLogout?: boolean
}

export function Topbar({ status, showLogout = false }: TopbarProps) {
  const { user, authenticated } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = user?.role === 'admin'

  const navLink = (href: string, label: string) => {
    const active = pathname === href || (href !== '/' && pathname?.startsWith(href))
    return (
      <Link
        href={href}
        className={`text-[14px] ml-4 py-1 border-b-2 transition-colors ${
          active
            ? 'text-[#e0e0e0] border-[#9146ff]'
            : 'text-[#444] border-transparent hover:text-[#999]'
        }`}
      >
        {label}
      </Link>
    )
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {}
    router.push('/login')
  }

  return (
    <div className="flex items-center justify-between px-4 md:px-8 py-[18px] border-b border-[#141414] bg-[#0d0d0d] sticky top-0 z-[100]">
      <div className="flex items-center gap-3 md:gap-6">
        <Link href="/" className="text-[17px] font-semibold tracking-wide flex items-center gap-[8px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logoclip.png" alt="" width={30} height={30} />
          clippy
        </Link>
        <nav className="flex flex-wrap">
          {navLink('/', 'home')}
          {navLink('/dashboard', 'dashboard')}
          {navLink('/clips', 'clips')}
          {isAdmin && navLink('/admin', 'admin')}
        </nav>
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        <DiscordLink />
        {status && <StatusPill live={status.live} label={status.label} />}
        {!showLogout && !authenticated && (
          <Link
            href="/login"
            className="bg-[#9146ff] hover:bg-[#7c3aed] text-white text-[13px] font-semibold px-4 py-[8px] rounded-md"
          >
            login
          </Link>
        )}
        {!showLogout && authenticated && user && (
          <Link href="/dashboard" className="flex items-center gap-2 text-[14px] text-[#666] hover:text-white">
            {user.profileImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.profileImage} alt="" width={22} height={22} className="rounded-full" />
            )}
            <span>{user.username}</span>
          </Link>
        )}
        {showLogout && user && (
          <>
            {user.profileImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.profileImage} alt="" width={24} height={24} className="rounded-full" />
            )}
            <span className="text-[14px] text-[#666]">{user.username}</span>
            <button
              onClick={logout}
              className="border border-[#222] hover:border-[#444] text-[#555] hover:text-[#999] text-[13px] px-3 py-1 rounded"
            >
              logout
            </button>
          </>
        )}
      </div>
    </div>
  )
}
