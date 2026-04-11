/**
 * Tiny fetch wrapper. All paths are relative to /api — they hit Next.js API
 * route handlers directly (same origin, same process).
 */
function url(path: string) {
  return path.startsWith('/api/') ? path : `/api${path}`
}

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(url(path), { credentials: 'include' })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json() as Promise<T>
}

export async function postJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(url(path), {
    method: 'POST',
    credentials: 'include',
    headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(err?.error || `${res.status} ${path}`)
  }
  return res.json() as Promise<T>
}

export async function deleteJSON<T = unknown>(path: string): Promise<T> {
  const res = await fetch(url(path), { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json() as Promise<T>
}

export const swrFetcher = <T,>(path: string): Promise<T> => getJSON<T>(path)
