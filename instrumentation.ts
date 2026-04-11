export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { webcrypto } = await import('node:crypto')
    if (!globalThis.crypto) (globalThis as any).crypto = webcrypto as any
    const { initDatabase } = await import('@/src/db/index')
    const { initWatchedChannels, startMomentCapture } = await import('@/src/moments')
    const { restoreTwitchAuth } = await import('@/src/clip')
    const { restoreLLMUsage, hasDirectAPI, getLLMBudget } = await import('@/src/summarize')
    const { loadWhitelist } = await import('@/src/auth')
    const { loadGlobalEmotes } = await import('@/src/tokenizer')
    const { connectFirehose } = await import('@/src/firehose')

    await initDatabase()
    await initWatchedChannels()
    await restoreTwitchAuth()
    await restoreLLMUsage()
    await loadWhitelist()
    await loadGlobalEmotes()

    setInterval(() => loadGlobalEmotes(), 30 * 60 * 1000)

    console.log(`[server] Clippy started via Next.js instrumentation`)
    console.log(`[server] Direct Anthropic API: ${hasDirectAPI() ? 'enabled' : 'disabled (set ANTHROPIC_API_KEY)'}`)
    console.log(`[server] LLM budget: $${getLLMBudget().limit}`)
    console.log(`[server] Connecting to Twitch firehose...`)

    connectFirehose()
    startMomentCapture()
  }
}
