// Core tokenization, scoring, and message analysis

import type { Vibe } from './vibe-map.js'
import { VIBE_MAP, EMOJI_VIBES, knownEmotes } from './vibe-map.js'
import type { VibeScores } from './vibe-map.js'

export type TokenType = 'emote' | 'word' | 'emoji' | 'punctuation' | 'mention' | 'url'

export interface Token {
  raw: string        // original text
  normalized: string // lowercased, collapsed repeats
  type: TokenType
  vibe: Vibe
  weight: number
}

// --- Gift sub detection tokens ---
const GIFT_SUB_TOKENS = new Set(['gifted', 'gifting'])
const GIFT_SUB_CONTEXT = new Set(['sub', 'subs', 'tier'])

// --- Unicode emoji detection (single codepoint check, no regex) ---
function isEmoji(str: string): boolean {
  const cp = str.codePointAt(0)
  if (!cp) return false
  return (cp >= 0x1F300 && cp <= 0x1FAD6) ||
         (cp >= 0x2600 && cp <= 0x27BF) ||
         (cp >= 0xFE00 && cp <= 0xFE0F) ||
         (cp >= 0x1F900 && cp <= 0x1F9FF)
}

// --- Normalize repeated characters: LOOOOL -> lol, HAHAHA -> haha ---
function normalizeRepeats(s: string): string {
  let result = ''
  let prev = ''
  let count = 0
  for (const ch of s) {
    if (ch === prev) {
      count++
      if (count < 2) result += ch
    } else {
      result += ch
      prev = ch
      count = 1
    }
  }
  return result.toLowerCase()
}

// Classify a single word/emote token via map lookup
function classifyWord(raw: string): Token {
  const lower = raw.toLowerCase()

  const direct = VIBE_MAP.get(lower)
  if (direct) {
    return { raw, normalized: lower, type: direct.type, vibe: direct.vibe, weight: direct.weight }
  }

  if (knownEmotes.has(lower)) {
    return { raw, normalized: lower, type: 'emote', vibe: 'neutral', weight: 0 }
  }

  const norm = normalizeRepeats(raw)
  const normLookup = VIBE_MAP.get(norm)
  if (normLookup) {
    return { raw, normalized: norm, type: normLookup.type, vibe: normLookup.vibe, weight: normLookup.weight }
  }

  if (lower === 'w') return { raw, normalized: lower, type: 'word', vibe: 'win', weight: 1 }
  if (lower === 'l') return { raw, normalized: lower, type: 'word', vibe: 'loss', weight: 1 }

  return { raw, normalized: lower, type: 'word', vibe: 'neutral', weight: 0 }
}

// --- Tokenize a message in a single pass ---
export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  const parts = text.split(/\s+/)

  for (const raw of parts) {
    if (!raw) continue

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      tokens.push({ raw, normalized: raw, type: 'url', vibe: 'neutral', weight: 0 })
      continue
    }

    if (raw.startsWith('@')) {
      tokens.push({ raw, normalized: raw.toLowerCase(), type: 'mention', vibe: 'neutral', weight: 0 })
      continue
    }

    if (/^[?!.]+$/.test(raw)) {
      const vibe: Vibe = raw.includes('?') && raw.length >= 3 ? 'awkward' : 'neutral'
      const weight = vibe === 'awkward' ? 1 : 0
      tokens.push({ raw, normalized: raw, type: 'punctuation', vibe, weight })
      continue
    }

    const chars = [...raw]
    let textPart = ''

    for (const ch of chars) {
      const emojiVibe = EMOJI_VIBES.get(ch)
      if (emojiVibe) {
        if (textPart) { tokens.push(classifyWord(textPart)); textPart = '' }
        tokens.push({ raw: ch, normalized: ch, type: 'emoji', vibe: emojiVibe.vibe, weight: emojiVibe.weight })
      } else if (isEmoji(ch)) {
        if (textPart) { tokens.push(classifyWord(textPart)); textPart = '' }
        tokens.push({ raw: ch, normalized: ch, type: 'emoji', vibe: 'neutral', weight: 0 })
      } else {
        textPart += ch
      }
    }

    if (textPart) tokens.push(classifyWord(textPart))
  }

  return tokens
}

// --- Score a tokenized message ---
export function scoreTokens(tokens: Token[]): VibeScores {
  const scores: VibeScores = { funny: 0, hype: 0, awkward: 0, win: 0, loss: 0 }
  for (const t of tokens) {
    if (t.vibe !== 'neutral' && t.weight > 0 && t.vibe in scores) {
      scores[t.vibe as keyof VibeScores] += t.weight
    }
  }

  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i].normalized
    const b = tokens[i + 1].normalized
    const bigram = a + ' ' + b

    switch (bigram) {
      case 'lets go':
      case 'let\'s go':
        scores.hype += 2; break
      case 'w take':
      case 'w chat':
      case 'w streamer':
        scores.win += 2; break
      case 'l take':
      case 'l chat':
      case 'l streamer':
        scores.loss += 2; break
      case 'no way':
      case 'no shot':
        scores.hype += 1; break
    }
  }

  return scores
}

// --- Detect gift sub messages from tokens (no regex) ---
export function isGiftSub(tokens: Token[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    const norm = tokens[i].normalized
    if (GIFT_SUB_TOKENS.has(norm)) {
      for (let j = Math.max(0, i - 2); j < Math.min(tokens.length, i + 4); j++) {
        if (j !== i && GIFT_SUB_CONTEXT.has(tokens[j].normalized)) {
          return true
        }
      }
    }
  }
  return false
}

// --- Message analysis: tokenize + score in one call ---
export interface MessageAnalysis {
  tokens: Token[]
  scores: VibeScores
  giftSub: boolean
  emoteOnly: boolean
  emoteCount: number
  wordCount: number
}

export function analyzeMessage(text: string): MessageAnalysis {
  const tokens = tokenize(text)
  const scores = scoreTokens(tokens)
  const giftSub = isGiftSub(tokens)

  let emoteCount = 0
  let wordCount = 0
  for (const t of tokens) {
    if (t.type === 'emote' || t.type === 'emoji') emoteCount++
    else if (t.type === 'word') wordCount++
  }

  const emoteOnly = emoteCount > 0 && wordCount === 0

  return { tokens, scores, giftSub, emoteOnly, emoteCount, wordCount }
}
