// Mood string → on-chain u8 mapping. Must match the Anchor program exactly.
export const MOOD_TO_U8: Record<string, number> = {
  hype: 0,
  funny: 1,
  rage: 2,
  clutch: 3,
  awkward: 4,
  wholesome: 5,
  drama: 6,
  shock: 7,
  sad: 8,
}

export const U8_TO_MOOD: Record<number, string> = Object.fromEntries(
  Object.entries(MOOD_TO_U8).map(([k, v]) => [v, k])
) as Record<number, string>

export function moodToU8(mood: string): number | null {
  const u = MOOD_TO_U8[mood.toLowerCase()]
  return typeof u === 'number' ? u : null
}

export function u8ToMood(u: number): string | null {
  return U8_TO_MOOD[u] ?? null
}

// ASCII-lowercase, zero-padded to 32 bytes. Matches on-chain canonical channel encoding.
export function encodeChannel32(channel: string): Buffer {
  const buf = Buffer.alloc(32)
  const bytes = Buffer.from(channel.toLowerCase(), 'ascii')
  if (bytes.length > 32) throw new Error(`channel too long (>32 bytes): ${channel}`)
  bytes.copy(buf, 0)
  return buf
}
