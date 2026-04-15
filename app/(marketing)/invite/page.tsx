'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function InviteInner() {
  const params = useSearchParams()
  const router = useRouter()

  const pendingToken = params.get('token')
  const pendingName = params.get('name')
  const pendingAvatar = params.get('avatar')
  const prefillCode = params.get('prefill')
  const errorParam = params.get('error')

  const [code, setCode] = useState('')
  const [showPrefillNote, setShowPrefillNote] = useState(false)

  useEffect(() => {
    if (!pendingToken) {
      router.replace('/login')
      return
    }
    if (prefillCode) {
      const cleaned = prefillCode.replace(/[^a-fA-F0-9]/g, '').slice(0, 16)
      if (cleaned.length > 0) {
        setCode(cleaned)
        if (cleaned.length >= 16) setShowPrefillNote(true)
      }
    }
  }, [pendingToken, prefillCode, router])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^a-fA-F0-9]/g, '')
    setCode(val)
    setShowPrefillNote(false)
  }

  const submit = () => {
    if (code.length < 16 || !pendingToken) return
    window.location.href = `/api/auth/verify-invite?token=${pendingToken}&invite=${encodeURIComponent(code)}`
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && code.length >= 16) submit()
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-[400px] p-10">
        <div className="text-[20px] font-semibold tracking-wide mb-2 flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logoclip.png" alt="" width={24} height={24} className="mr-2" />
          clippy
        </div>
        <div className="text-[14px] text-[#444] mb-8 leading-relaxed">
          you&apos;re almost in — enter your invite code
        </div>

        <Link href="/login" className="inline-flex items-center gap-2 text-[13px] text-[#555] hover:text-white mb-6">
          <span>&larr;</span> back to login
        </Link>

        {pendingName && (
          <div className="flex items-center gap-[12px] px-4 py-3 bg-[#111] border border-[#1a1a1a] rounded-md mb-6 text-[14px]">
            {pendingAvatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={decodeURIComponent(pendingAvatar)} alt="" width={28} height={28} className="rounded-full" />
            )}
            <div>
              <div className="text-white font-medium">{pendingName}</div>
              <div className="text-[#444] text-[13px]">twitch account verified</div>
            </div>
          </div>
        )}

        {errorParam === 'invalid_invite' && (
          <div className="bg-[#1a0a0a] border border-[#331111] rounded-md px-4 py-3 text-[14px] text-[#f87171] mb-6">
            Invalid or exhausted invite code. Try again or enter a different code.
          </div>
        )}

        <div className="mb-6">
          <label className="block text-[12px] uppercase tracking-wider text-[#555] mb-2">invite code</label>
          <input
            type="text"
            value={code}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder="enter your 16-character code"
            maxLength={16}
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-[#111] border border-[#1a1a1a] focus:border-[#333] rounded-md px-4 py-[18px] text-white text-[16px] tracking-[2px] outline-none transition-colors placeholder:text-[#222] placeholder:tracking-normal"
          />
          {showPrefillNote && (
            <div className="text-[12px] text-[#22c55e] mt-[6px]">code auto-filled from your invite link</div>
          )}
        </div>

        <button
          disabled={code.length < 16}
          onClick={submit}
          className="btn-purple w-full py-[18px] text-[15px]"
        >
          verify &amp; enter
        </button>

        <div className="text-[13px] text-[#333] mt-6 text-center leading-relaxed">
          need an invite? ask someone who already has access
          <br />
          <Link href="/login" className="text-[#555] hover:text-white">
            use a different twitch account
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function InvitePage() {
  return (
    <Suspense fallback={null}>
      <InviteInner />
    </Suspense>
  )
}
