'use client'

import { useEffect, useState } from 'react'

export function Countdown({ windowEnd }: { windowEnd: number }) {
  const [secs, setSecs] = useState(() => Math.max(0, windowEnd - Math.floor(Date.now() / 1000)))

  useEffect(() => {
    const id = setInterval(() => {
      const left = Math.max(0, windowEnd - Math.floor(Date.now() / 1000))
      setSecs(left)
      if (left <= 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [windowEnd])

  const m = Math.floor(secs / 60)
  const s = secs % 60
  const urgent = secs > 0 && secs <= 30

  return (
    <span className={`font-mono text-[14px] ${urgent ? 'text-[#f59e0b]' : secs === 0 ? 'text-[#555]' : 'text-[#ddd]'}`}>
      {secs <= 0 ? 'closed' : `${m}:${s.toString().padStart(2, '0')}`}
    </span>
  )
}
