// Lazy, idempotent server-side initialization.
//
// We intentionally avoid Next.js `instrumentation.ts` because it forces
// webpack to eagerly compile the entire `src/` graph, which deadlocks on the
// heavy transitive deps (express, drizzle, @anthropic-ai/sdk).
//
// Instead, API routes call `ensureStarted()` which kicks off the startup
// tasks in the background on the first request. The returned promise lets
// callers await readiness if they need to, but the server can begin serving
// requests immediately.

let started = false
let bootPromise: Promise<void> | null = null

async function boot() {
  const { webcrypto } = await import('node:crypto')
  if (!globalThis.crypto) (globalThis as any).crypto = webcrypto as any

  const { initDatabase } = await import('@/src/db/index')
  const { initWatchedChannels, startMomentCapture } = await import('@/src/moments')
  const { restoreTwitchAuth } = await import('@/src/clip')
  const { restoreLLMUsage, hasDirectAPI, getLLMBudget } = await import('@/src/summarize')
  const { loadWhitelist } = await import('@/src/auth')
  const { loadGlobalEmotes } = await import('@/src/tokenizer')
  const { connectFirehose } = await import('@/src/firehose')

  await Promise.allSettled([
    initDatabase(),
    initWatchedChannels(),
    restoreTwitchAuth(),
    restoreLLMUsage(),
    loadWhitelist(),
    loadGlobalEmotes(),
  ])

  setInterval(() => loadGlobalEmotes(), 30 * 60 * 1000)

  console.log(`[server] Clippy started (lazy init)`)
  console.log(`[server] Direct Anthropic API: ${hasDirectAPI() ? 'enabled' : 'disabled (set ANTHROPIC_API_KEY)'}`)
  console.log(`[server] LLM budget: $${getLLMBudget().limit}`)
  console.log(`[server] Connecting to Twitch firehose...`)

  connectFirehose()
  startMomentCapture()

  // Oracle scheduler — dynamic import so environments without Solana env vars
  // (or missing optional deps) still boot cleanly. startOracleScheduler() is a
  // no-op when the required env vars are missing.
  try {
    const oracle = await import('@/src/oracle/scheduler')
    oracle.startOracleScheduler()
  } catch (err: any) {
    console.error('[oracle] scheduler import failed:', err?.message || err)
  }
}

export function ensureStarted(): Promise<void> {
  if (started) return Promise.resolve()
  if (!bootPromise) {
    started = true
    bootPromise = boot().catch((err) => {
      console.error('[server] Startup error:', err?.message || err)
    })
  }
  return bootPromise
}
