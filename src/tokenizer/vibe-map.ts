// Vibe scoring data, emote/word dictionaries, and registration helpers

import type { Vibe } from '../../lib/types.js'
export type { Vibe }

export interface VibeScores {
  funny: number
  hype: number
  awkward: number
  win: number
  loss: number
}

// --- Emote + word vibe dictionary ---
// All lookups are O(1) via Map. Keys are lowercase.
export const VIBE_MAP = new Map<string, { vibe: Vibe; weight: number; type: 'emote' | 'word' }>()

function emote(name: string, vibe: Vibe, weight: number) {
  VIBE_MAP.set(name.toLowerCase(), { vibe, weight, type: 'emote' })
}
function word(name: string, vibe: Vibe, weight: number) {
  VIBE_MAP.set(name.toLowerCase(), { vibe, weight, type: 'word' })
}

// ── Funny emotes ──
emote('KEKW', 'funny', 2);      emote('OMEGALUL', 'funny', 2)
emote('LUL', 'funny', 1);       emote('LULW', 'funny', 2)
emote('ICANT', 'funny', 2);     emote('pepeLaugh', 'funny', 2)
emote('LMAO', 'funny', 2);      emote('ROFL', 'funny', 2)
emote('4Head', 'funny', 1);     emote('EleGiggle', 'funny', 1)
emote('SeemsGood', 'funny', 1); emote('pepeJam', 'funny', 1)
emote('pepeMeltdown', 'funny', 2); emote('WAYTOODANK', 'funny', 2)
emote('Deadge', 'funny', 2);    emote('forsenLaughingAtYou', 'funny', 2)

// ── Hype emotes ──
emote('PogChamp', 'hype', 2);   emote('PogU', 'hype', 2)
emote('Pog', 'hype', 2);        emote('POGGIES', 'hype', 2)
emote('POGGERS', 'hype', 2);    emote('peepoClap', 'hype', 1)
emote('Clap', 'hype', 1);       emote('widepeepoHappy', 'hype', 1)
emote('HYPERS', 'hype', 2);     emote('GIGACHAD', 'hype', 2)
emote('EZ', 'hype', 1);         emote('Catjam', 'hype', 1)
emote('BASED', 'hype', 2);      emote('FeelsStrongMan', 'hype', 2)

// ── Awkward emotes ──
emote('monkaS', 'awkward', 2);   emote('monkaW', 'awkward', 2)
emote('monkaHmm', 'awkward', 1); emote('Clueless', 'awkward', 1)
emote('Aware', 'awkward', 2);    emote('D:', 'awkward', 2)
emote('NotLikeThis', 'awkward', 2); emote('FailFish', 'awkward', 1)
emote('modCheck', 'awkward', 1); emote('Sussy', 'awkward', 1)
emote('Suge', 'awkward', 1)

// ── Win/Loss emotes ──
emote('Sadge', 'loss', 1);        emote('widepeepoSad', 'loss', 1)
emote('BibleThump', 'loss', 1);   emote('PepeHands', 'loss', 2)
emote('Copium', 'loss', 1);       emote('ResidentSleeper', 'loss', 1)

// ── Funny words ──
word('lol', 'funny', 1);   word('lmao', 'funny', 2)
word('lmfao', 'funny', 2); word('rofl', 'funny', 2)
word('haha', 'funny', 1);  word('hahaha', 'funny', 2)
word('dead', 'funny', 1);  word('dying', 'funny', 1)
word('bruh', 'funny', 1)

// ── Hype words ──
word('insane', 'hype', 2);  word('holy', 'hype', 1)
word('sheesh', 'hype', 1);  word('alarm', 'hype', 2)
word('maxwin', 'hype', 2);  word('clutch', 'hype', 2)
word('goated', 'hype', 2);  word('goat', 'hype', 1)
word('bang', 'hype', 2);    word('banger', 'hype', 2)
word('clean', 'hype', 1);   word('nuts', 'hype', 1)
word('crazy', 'hype', 1);   word('insane', 'hype', 2)
word('godlike', 'hype', 2)

// ── Awkward words ──
word('yikes', 'awkward', 2);  word('cringe', 'awkward', 2)
word('weird', 'awkward', 1);  word('sus', 'awkward', 1)
word('sussy', 'awkward', 1);  word('uh', 'awkward', 1)
word('uhh', 'awkward', 1);    word('eww', 'awkward', 1)
word('ew', 'awkward', 1)

// ── Win words ──
word('ww', 'win', 2);  word('www', 'win', 2)
word('dub', 'win', 1);  word('gg', 'win', 1)

// ── Loss words ──
word('ll', 'loss', 2);  word('lll', 'loss', 2)
word('rip', 'loss', 1); word('oof', 'loss', 1)
word('f', 'loss', 1);   word('ff', 'loss', 1)

// --- Emoji vibe map ---
export const EMOJI_VIBES = new Map<string, { vibe: Vibe; weight: number }>([
  ['\u{1F480}', { vibe: 'funny', weight: 2 }],   // skull
  ['\u{1F602}', { vibe: 'funny', weight: 1 }],   // joy
  ['\u{1F923}', { vibe: 'funny', weight: 2 }],   // rofl
  ['\u{1F62D}', { vibe: 'funny', weight: 1 }],   // sob (used as laughing on twitch)
  ['\u{1F525}', { vibe: 'hype', weight: 1 }],    // fire
  ['\u{1F6A8}', { vibe: 'hype', weight: 2 }],    // rotating light
  ['\u{1F389}', { vibe: 'hype', weight: 1 }],    // party
  ['\u{1F631}', { vibe: 'awkward', weight: 1 }],  // scream
  ['\u{1F622}', { vibe: 'loss', weight: 1 }],     // cry
])

// --- Known emote set (populated from 7TV/BTTV/FFZ APIs) ---
export const knownEmotes = new Set<string>()       // lowercase emote names (global)
export const channelEmotes = new Map<string, Set<string>>()  // per-channel emote sets

// Auto-assign vibes to emotes based on name keywords
const VIBE_KEYWORDS: { pattern: string; vibe: Vibe; weight: number }[] = [
  // Funny
  { pattern: 'laugh', vibe: 'funny', weight: 1 },
  { pattern: 'lol', vibe: 'funny', weight: 1 },
  { pattern: 'lul', vibe: 'funny', weight: 1 },
  { pattern: 'kek', vibe: 'funny', weight: 1 },
  { pattern: 'dead', vibe: 'funny', weight: 1 },
  { pattern: 'clown', vibe: 'funny', weight: 1 },
  { pattern: 'melt', vibe: 'funny', weight: 1 },
  { pattern: 'comedy', vibe: 'funny', weight: 1 },
  { pattern: 'bruh', vibe: 'funny', weight: 1 },
  // Hype
  { pattern: 'pog', vibe: 'hype', weight: 1 },
  { pattern: 'hype', vibe: 'hype', weight: 1 },
  { pattern: 'clap', vibe: 'hype', weight: 1 },
  { pattern: 'dance', vibe: 'hype', weight: 1 },
  { pattern: 'jam', vibe: 'hype', weight: 1 },
  { pattern: 'happy', vibe: 'hype', weight: 1 },
  { pattern: 'strong', vibe: 'hype', weight: 1 },
  { pattern: 'chad', vibe: 'hype', weight: 1 },
  { pattern: 'based', vibe: 'hype', weight: 1 },
  { pattern: 'fire', vibe: 'hype', weight: 1 },
  // Awkward
  { pattern: 'monka', vibe: 'awkward', weight: 1 },
  { pattern: 'scared', vibe: 'awkward', weight: 1 },
  { pattern: 'sus', vibe: 'awkward', weight: 1 },
  { pattern: 'weird', vibe: 'awkward', weight: 1 },
  { pattern: 'cringe', vibe: 'awkward', weight: 1 },
  { pattern: 'stare', vibe: 'awkward', weight: 1 },
  { pattern: 'clueless', vibe: 'awkward', weight: 1 },
  // Loss
  { pattern: 'sad', vibe: 'loss', weight: 1 },
  { pattern: 'cry', vibe: 'loss', weight: 1 },
  { pattern: 'pain', vibe: 'loss', weight: 1 },
  { pattern: 'copium', vibe: 'loss', weight: 1 },
  { pattern: 'despair', vibe: 'loss', weight: 1 },
  { pattern: 'sadge', vibe: 'loss', weight: 1 },
  { pattern: 'rip', vibe: 'loss', weight: 1 },
  // Win
  { pattern: 'win', vibe: 'win', weight: 1 },
  { pattern: 'gg', vibe: 'win', weight: 1 },
  { pattern: 'ez', vibe: 'win', weight: 1 },
]

function autoVibeFromName(name: string): { vibe: Vibe; weight: number } | null {
  const lower = name.toLowerCase()
  for (const { pattern, vibe, weight } of VIBE_KEYWORDS) {
    if (lower.includes(pattern)) return { vibe, weight }
  }
  return null
}

export function registerEmote(name: string) {
  const lower = name.toLowerCase()
  knownEmotes.add(lower)
  if (!VIBE_MAP.has(lower)) {
    const autoVibe = autoVibeFromName(name)
    if (autoVibe) {
      VIBE_MAP.set(lower, { vibe: autoVibe.vibe, weight: autoVibe.weight, type: 'emote' })
    }
  }
}

export function registerChannelEmote(channel: string, name: string) {
  const ch = channel.toLowerCase()
  if (!channelEmotes.has(ch)) channelEmotes.set(ch, new Set())
  channelEmotes.get(ch)!.add(name.toLowerCase())
  registerEmote(name)
}
