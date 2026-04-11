'use client'

import { useEffect, useRef, useState } from 'react'

export interface SSEHookResult {
  connected: boolean
}

/**
 * Subscribe to a Server-Sent Events endpoint with automatic cleanup.
 * The handler is called for every parsed message; transient state lives in
 * the parent component (we don't buffer here).
 */
export function useSSE(
  url: string,
  onMessage: (data: unknown) => void,
  enabled = true
): SSEHookResult {
  const [connected, setConnected] = useState(false)
  const handlerRef = useRef(onMessage)
  handlerRef.current = onMessage

  useEffect(() => {
    if (!enabled) return
    const fullUrl = url.startsWith('/api/') ? url : `/api${url}`
    const es = new EventSource(fullUrl)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data?.type === 'connected') setConnected(true)
        handlerRef.current(data)
      } catch {
        // ignore malformed
      }
    }
    es.onerror = () => setConnected(false)
    es.onopen = () => setConnected(true)
    return () => {
      es.close()
      setConnected(false)
    }
  }, [url, enabled])

  return { connected }
}
