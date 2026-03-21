import { getRecentMessages } from './firehose.js'
import { Mppx, tempo } from 'mppx/client'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempo as tempoChain } from 'viem/chains'

// Session key from `tempo wallet keys`
const SESSION_KEY = process.env.TEMPO_SESSION_KEY || '0x68c50e09fea51bb3e113dca81a56f3c6cc5b354bdf1d4715780a9c0b2ecf1251'

const account = privateKeyToAccount(SESSION_KEY as `0x${string}`)

const mppClient = Mppx.create({
  methods: [
    tempo({
      account,
      maxDeposit: '0.50',
      walletClient: createWalletClient({
        account,
        chain: tempoChain,
        transport: http(process.env.TEMPO_RPC || 'https://rpc.tempo.xyz'),
      }),
    }),
  ],
})

// Helper: fetch with retry on 429
async function mppFetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await mppClient.fetch(url, options)
    if (res.status !== 429) return res
    const wait = 5000 * (i + 1) // 5s, 10s, 15s
    console.log(`[mpp] 429 rate limited, retrying in ${wait/1000}s...`)
    await new Promise(r => setTimeout(r, wait))
  }
  return mppClient.fetch(url, options)
}

// Call Anthropic via MPP to summarize chat
export async function summarizeChannel(channel: string): Promise<{
  summary: string
  sentiment: string
  topTopics: string[]
}> {
  const messages = getRecentMessages(channel, 100)

  if (messages.length === 0) {
    return {
      summary: `No recent messages found for channel "${channel}".`,
      sentiment: 'neutral',
      topTopics: [],
    }
  }

  const chatLog = messages.join('\n')

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: `You are analyzing a Twitch chat log. Summarize what the chat is talking about in 2-3 sentences. Also identify the overall sentiment (positive, negative, excited, toxic, chill, mixed) and the top 3 topics being discussed.

Respond ONLY with this JSON format, no other text:
{"summary": "...", "sentiment": "...", "topTopics": ["topic1", "topic2", "topic3"]}

Here is the chat log:
${chatLog}`,
      },
    ],
  }

  try {
    console.log('[summarize] Calling Anthropic via MPP...')
    const res = await mppFetchWithRetry('https://anthropic.mpp.tempo.xyz/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const result = await res.text()
    console.log('[summarize] Raw response length:', result.length)
    console.log('[summarize] Raw response:', result.substring(0, 500))

    // Parse Anthropic response
    const response = JSON.parse(result)
    const text = response.content?.[0]?.text || response.text || result

    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        summary: parsed.summary || 'Unable to summarize.',
        sentiment: parsed.sentiment || 'unknown',
        topTopics: parsed.topTopics || [],
      }
    }

    return {
      summary: typeof text === 'string' ? text : JSON.stringify(text),
      sentiment: 'unknown',
      topTopics: [],
    }
  } catch (err: any) {
    console.error('[summarize] Error calling Anthropic via MPP:', err.message)

    // Fallback: basic local summary
    return buildFallbackSummary(messages)
  }
}

// Quick spike classification — takes chat snapshot, returns mood + what happened
export async function classifySpike(chatSnapshot: string[]): Promise<{
  mood: string
  description: string
  clipWorthy: boolean
} | null> {
  if (chatSnapshot.length === 0) return null

  const chatLog = chatSnapshot.join('\n')

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: `Twitch chat just spiked. Classify the mood, say what happened in ONE short sentence, and decide if this is clip-worthy (a viewer would rewind to see this moment).

Moods: hype, funny, rage, clutch, awkward, wholesome, drama, shock, sad, neutral

Respond ONLY with JSON: {"mood": "...", "description": "...", "clipWorthy": true/false}

Chat:
${chatLog}`,
      },
    ],
  }

  try {
    const res = await mppFetchWithRetry('https://anthropic.mpp.tempo.xyz/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const result = await res.text()
    if (!res.ok) {
      console.error(`[classify] HTTP ${res.status}: ${result.substring(0, 200)}`)
      return null
    }
    const response = JSON.parse(result)
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
    if (err.cause) console.error('[classify] Cause:', err.cause)
    if (err.status) console.error('[classify] Status:', err.status)
    return null
  }
}

function buildFallbackSummary(messages: string[]) {
  const wordFreq = new Map<string, number>()
  const stopWords = new Set(['that', 'this', 'with', 'from', 'have', 'they', 'what', 'just', 'like', 'your', 'will'])

  for (const msg of messages) {
    const words = msg.split(':').slice(1).join(':').trim().toLowerCase().split(/\s+/)
    for (const word of words) {
      if (word.length > 3 && !stopWords.has(word)) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1)
      }
    }
  }
  const topWords = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word)

  return {
    summary: `Chat is active with ${messages.length} recent messages. Common words: ${topWords.join(', ')}. (LLM summary unavailable — using fallback)`,
    sentiment: 'unknown',
    topTopics: topWords.slice(0, 3),
  }
}
