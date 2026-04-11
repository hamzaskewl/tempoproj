import { getRecentMessages } from '../firehose/index.js'
import { Mppx, tempo } from 'mppx/client'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempo as tempoChain } from 'viem/chains'
import {
  ANTHROPIC_API_KEY, ANTHROPIC_API_URL, ANTHROPIC_MODEL,
  isBudgetExhausted, trackUsage,
} from './budget.js'

const SESSION_KEY = process.env.TEMPO_SESSION_KEY || '0x68c50e09fea51bb3e113dca81a56f3c6cc5b354bdf1d4715780a9c0b2ecf1251'
const account = privateKeyToAccount(SESSION_KEY as `0x${string}`)
const tempoMethod = tempo({
  account,
  maxDeposit: '1.00',
  // @ts-ignore walletClient required at runtime but missing from mppx types
  walletClient: createWalletClient({
    account,
    chain: tempoChain,
    transport: http(process.env.TEMPO_RPC || 'https://rpc.tempo.xyz'),
  }),
})
const mppClient = Mppx.create({ methods: [tempoMethod] })

const SYSTEM_PROMPT = `You are analyzing a Twitch chat log. Summarize what the chat is talking about in 2-3 sentences. Also identify the overall sentiment (positive, negative, excited, toxic, chill, mixed) and the top 3 topics being discussed.

Respond ONLY with this JSON format, no other text:
{"summary": "...", "sentiment": "...", "topTopics": ["topic1", "topic2", "topic3"]}`

export async function mppFetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await mppClient.fetch(url, options)
    if (res.status !== 429) return res
    const wait = 5000 * (i + 1) // 5s, 10s, 15s
    console.log(`[mpp] 429 rate limited, retrying in ${wait/1000}s...`)
    await new Promise(r => setTimeout(r, wait))
  }
  return mppClient.fetch(url, options)
}

export async function anthropicFetch(body: object): Promise<any> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
  if (isBudgetExhausted()) throw new Error('LLM budget exhausted')

  for (let i = 0; i <= 2; i++) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 5000 * (i + 1)))
      continue
    }
    const result = await res.json()
    trackUsage(result)
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${JSON.stringify(result)}`)
    return result
  }

  throw new Error('Anthropic API: max retries exceeded')
}

export async function summarizeChannel(channel: string): Promise<{
  summary: string
  sentiment: string
  topTopics: string[]
}> {
  const messages = getRecentMessages(channel, 100)

  if (messages.length === 0) {
    return { summary: `No recent messages found for channel "${channel}".`, sentiment: 'neutral', topTopics: [] }
  }
  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: `${SYSTEM_PROMPT}\n\nHere is the chat log:\n${messages.join('\n')}`,
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
    const response = JSON.parse(result)
    const text = response.content?.[0]?.text || response.text || result
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return { summary: parsed.summary || 'Unable to summarize.', sentiment: parsed.sentiment || 'unknown', topTopics: parsed.topTopics || [] }
    }
    return { summary: typeof text === 'string' ? text : JSON.stringify(text), sentiment: 'unknown', topTopics: [] }
  } catch (err: any) {
    console.error('[summarize] Error calling Anthropic via MPP:', err.message)
    return buildFallbackSummary(messages)
  }
}

export async function summarizeChannelDirect(channel: string): Promise<{
  summary: string
  sentiment: string
  topTopics: string[]
}> {
  const messages = getRecentMessages(channel, 100)
  if (messages.length === 0) {
    return { summary: `No recent messages for "${channel}".`, sentiment: 'neutral', topTopics: [] }
  }

  try {
    const response = await anthropicFetch({
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `${SYSTEM_PROMPT}\n\nHere is the chat log:\n${messages.join('\n')}`,
        },
      ],
    })

    const text = response.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        summary: parsed.summary || 'Unable to summarize.',
        sentiment: parsed.sentiment || 'unknown',
        topTopics: parsed.topTopics || [],
      }
    }
    return { summary: text, sentiment: 'unknown', topTopics: [] }
  } catch (err: any) {
    console.error('[summarize-direct] Error:', err.message)
    return buildFallbackSummary(messages)
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
