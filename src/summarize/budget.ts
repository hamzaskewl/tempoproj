import { db } from '../db/index.js'
import { llmUsage } from '../db/schema.js'
import { eq } from 'drizzle-orm'

// --- Direct Anthropic API (for dashboard users, free tier) ---
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
export const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

// Budget tracking (restored from DB on startup)
export let totalInputTokens = 0
export let totalOutputTokens = 0
export let totalCalls = 0
export const BUDGET_LIMIT_USD = parseFloat(process.env.LLM_BUDGET_USD || '20')

export function estimateCostUSD(): number {
  // Haiku 4.5 pricing: $0.80/1M input, $4/1M output
  return (totalInputTokens * 0.8 + totalOutputTokens * 4) / 1_000_000
}

export function getLLMBudget() {
  const spent = estimateCostUSD()
  return {
    spent: Math.round(spent * 10000) / 10000,
    limit: BUDGET_LIMIT_USD,
    remaining: Math.round((BUDGET_LIMIT_USD - spent) * 10000) / 10000,
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
  }
}

export function isBudgetExhausted(): boolean {
  return estimateCostUSD() >= BUDGET_LIMIT_USD
}

// Restore LLM usage from DB
export async function restoreLLMUsage() {
  if (!db) return
  try {
    const rows = await db.select().from(llmUsage).where(eq(llmUsage.id, 'global'))
    if (rows.length > 0) {
      totalInputTokens = rows[0].totalInputTokens
      totalOutputTokens = rows[0].totalOutputTokens
      totalCalls = rows[0].totalCalls
      console.log(`[llm] Restored usage: ${totalCalls} calls, $${estimateCostUSD().toFixed(4)} spent`)
    }
  } catch (err: any) {
    console.error('[llm] Failed to restore usage:', err.message)
  }
}

// Persist LLM usage to DB (called after each API call)
export async function persistLLMUsage() {
  if (!db) return
  try {
    await db.insert(llmUsage).values({
      id: 'global',
      totalInputTokens,
      totalOutputTokens,
      totalCalls,
    }).onConflictDoUpdate({
      target: llmUsage.id,
      set: {
        totalInputTokens,
        totalOutputTokens,
        totalCalls,
        updatedAt: new Date(),
      },
    })
  } catch {}
}

// Track token usage from an API response
export function trackUsage(result: any) {
  if (result.usage) {
    totalInputTokens += result.usage.input_tokens || 0
    totalOutputTokens += result.usage.output_tokens || 0
    totalCalls++
    persistLLMUsage()
  }
}

// Returns true if direct Anthropic API is available and within budget
export function hasDirectAPI(): boolean {
  return !!ANTHROPIC_API_KEY && !isBudgetExhausted()
}
