'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DiscordLink } from '@/components/DiscordLink'

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: 'Twitch OAuth failed. Try again.',
  user_fetch_failed: 'Could not fetch your Twitch profile.',
  server_error: 'Something went wrong. Try again.',
  access_denied: 'You cancelled the Twitch login. Click below to retry.',
  missing_code: 'Twitch did not return an authorization code. Try again.',
}

function LoginInner() {
  const params = useSearchParams()
  const router = useRouter()
  const [tosAccepted, setTosAccepted] = useState(false)

  const errorKey = params.get('error')
  const errorMsg = errorKey ? ERROR_MESSAGES[errorKey] || 'Unknown error.' : null

  useEffect(() => {
    // If already logged in, redirect to dashboard
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) router.replace('/dashboard')
      })
      .catch(() => {})
  }, [router])

  function doLogin() {
    const invite = params.get('invite') || params.get('code') || ''
    const url = invite ? `/api/auth/twitch?invite=${encodeURIComponent(invite)}` : '/api/auth/twitch'
    window.location.href = url
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-[440px] p-10">
        <div className="text-[20px] font-semibold tracking-wide mb-2 flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logoclip.png" alt="" width={24} height={24} className="mr-2" />
          clippy
        </div>
        <div className="text-[14px] text-[#444] mb-8 leading-relaxed">
          real-time twitch stream intelligence &amp; auto-clipping
        </div>

        {errorMsg && (
          <div className="bg-[#1a0a0a] border border-[#331111] rounded-md px-4 py-3 text-[14px] text-[#f87171] mb-6">
            {errorMsg}
          </div>
        )}

        <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-lg p-5 mb-6 text-[13px] text-[#666] leading-[1.8]">
          <h3 className="text-[13px] uppercase tracking-wider text-[#888] mb-3 font-medium">before you continue</h3>
          <ul className="list-none space-y-1">
            <li className="pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-[#333]">
              <span className="text-[#999]">Clips are created on your Twitch account.</span> When clippy detects a highlight moment, it uses your Twitch credentials to create clips — these will appear as clips you made.
            </li>
            <li className="pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-[#333]">
              You grant clippy the <span className="text-[#999]">clips:edit</span> permission through Twitch OAuth. You can revoke this anytime from your Twitch settings.
            </li>
            <li className="pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-[#333]">
              This is a <span className="text-[#999]">free service</span> during early access. You get 3 channel slots to monitor live streams for auto-clipping.
            </li>
            <li className="pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-[#333]">
              By logging in, you agree to abide by{' '}
              <a href="https://www.twitch.tv/p/legal/terms-of-service/" target="_blank" rel="noreferrer" className="text-[#9146ff]">
                Twitch's Terms of Service
              </a>{' '}
              and{' '}
              <a href="https://www.twitch.tv/p/legal/community-guidelines/" target="_blank" rel="noreferrer" className="text-[#9146ff]">
                Community Guidelines
              </a>{' '}
              regarding clip creation.
            </li>
            <li className="pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-[#333]">
              You are responsible for clips created on your account. Don't use this to clip content that violates Twitch TOS.
            </li>
          </ul>
        </div>

        <label className="flex items-start gap-[12px] mb-6 text-[13px] text-[#666] leading-relaxed cursor-pointer">
          <input
            type="checkbox"
            checked={tosAccepted}
            onChange={(e) => setTosAccepted(e.target.checked)}
            className="mt-[3px] cursor-pointer accent-[#9146ff]"
          />
          <span>I understand that clips will be created on my Twitch account and I agree to Twitch's Terms of Service.</span>
        </label>

        <button
          disabled={!tosAccepted}
          onClick={doLogin}
          className="btn-purple w-full py-[18px] text-[15px]"
        >
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
          </svg>
          login with twitch
        </button>

        <div className="text-[13px] text-[#333] mt-6 text-center leading-relaxed">
          you'll need an invite code to complete sign-up
          <br />
          have one already? just click login above
        </div>

        <div className="mt-4 flex justify-start">
          <DiscordLink size={16} />
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}
