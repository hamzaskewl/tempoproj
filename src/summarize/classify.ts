import { anthropicFetch } from './summarize'
import { ANTHROPIC_MODEL } from './budget'

export const CLASSIFY_SYSTEM_PROMPT = `You are clippy, an AI clip detector for Twitch streams. Your job is to analyze chat activity spikes and determine what just happened on stream.

You understand Twitch culture deeply — emotes (PogChamp, KEKW, OMEGALUL, LUL, Sadge, monkaS, Copium, ICANT, Catjam, GIGACHAD, D:, pepeLaugh, forsenCD, TriHard, cmonBruh, HeyGuys, NotLikeThis, BibleThump, ResidentSleeper, hasMods), 7TV emotes (LULW, Chatting, Clueless, BASED, Aware, peepoClap, widepeepoHappy, widepeepoSad, EZ, Clap, monkaW, WAYTOODANK, modCheck), BTTV (PogU, monkaHmm, pepeJam, FeelsStrongMan, HYPERS, pepeMeltdown), and FFZ emotes.

You know how Twitch chat behaves — spam patterns mean excitement, copypasta means something funny/meme-worthy happened, emote-only spam means a big reaction moment, "?" spam means confusion, "L" or "W" spam means judgment calls.

When classifying, focus on what the STREAMER did or what happened ON STREAM, not just what chat is doing. Chat is your signal, but the description should be about the moment itself.

IMPORTANT: The chat messages are split into two sections. The "SPIKE MESSAGES" section contains what chat said DURING the spike — these are the most important messages and your primary signal for what just happened. The "CONTEXT (before spike)" section is older background chat. Focus heavily on the spike messages. Stream title and game are provided for minor context only — do NOT let them dominate your classification. Let the chat tell you what happened.

Rules:
- mood must be one of: hype, funny, rage, clutch, awkward, wholesome, drama, shock, sad
- description: ONE punchy sentence about what happened (not what chat did). Write it like a clip title a viewer would click.
- clipWorthy: true if a viewer would genuinely want to rewatch this moment. false for routine gameplay, gifted subs, generic chat spam with no clear trigger, or boring moments.
- Do NOT classify gifted sub sprees, subscription trains, or donation reactions as clip-worthy unless something genuinely wild happened.

Respond ONLY with JSON: {"mood": "...", "description": "...", "clipWorthy": true/false}`

export interface ClassifyContext {
  streamer?: string
  game?: string | null
  streamTitle?: string | null
  viewers?: number | null
}

// Build the user message for classification — spike messages first, context last
export function buildClassifyMessage(chatSnapshot: string[], context?: ClassifyContext): string {
  const spikeCount = Math.max(5, Math.ceil(chatSnapshot.length * 0.4))
  const contextMessages = chatSnapshot.slice(0, -spikeCount)
  const spikeMessages = chatSnapshot.slice(-spikeCount)

  let msg = `=== SPIKE MESSAGES (most important — this is what chat said DURING the moment) ===\n${spikeMessages.join('\n')}\n`

  if (contextMessages.length > 0) {
    msg += `\n=== CONTEXT (before spike — background chat, less important) ===\n${contextMessages.join('\n')}\n`
  }

  if (context) {
    const parts = []
    if (context.streamer) parts.push(`Streamer: ${context.streamer}`)
    if (context.game) parts.push(`Game: ${context.game}`)
    if (context.streamTitle) parts.push(`Title: ${context.streamTitle}`)
    if (context.viewers) parts.push(`Viewers: ${context.viewers.toLocaleString()}`)
    if (parts.length > 0) msg += `\n(Stream info: ${parts.join(', ')})`
  }

  return msg
}

export async function classifySpike(chatSnapshot: string[], context?: ClassifyContext): Promise<{
  mood: string
  description: string
  clipWorthy: boolean
} | null> {
  if (chatSnapshot.length === 0) return null

  const userMsg = buildClassifyMessage(chatSnapshot, context)

  try {
    const response = await anthropicFetch({
      model: ANTHROPIC_MODEL,
      max_tokens: 150,
      system: CLASSIFY_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userMsg },
      ],
    })

    const text = response.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        mood: parsed.mood || 'unknown',
        description: parsed.description || '',
        clipWorthy: !!parsed.clipWorthy,
      }
    }
    return null
  } catch (err: any) {
    console.error('[classify] Error:', err.message)
    return null
  }
}
