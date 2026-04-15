import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const raw = process.env.DATABASE_URL
const DATABASE_URL = raw && URL.canParse(raw) ? raw : null

if (!DATABASE_URL) {
  console.warn('[db] DATABASE_URL not set or invalid — running without persistence (in-memory only)')
}

const client = DATABASE_URL ? postgres(DATABASE_URL, { max: 10, connect_timeout: 30, onnotice: () => {} }) : null

export const db = client ? drizzle(client, { schema }) : null

// Auto-create tables on first connect
export async function initDatabase(retries = 3) {
  if (!db || !client) {
    console.log('[db] No database configured — skipping init')
    return
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await _initTables()
    } catch (err: any) {
      if (attempt < retries && (err.code === 'CONNECT_TIMEOUT' || err.errno === 'CONNECT_TIMEOUT')) {
        const delay = attempt * 2000
        console.warn(`[db] Connection timeout (attempt ${attempt}/${retries}), retrying in ${delay / 1000}s...`)
        await new Promise(r => setTimeout(r, delay))
      } else {
        console.error('[db] Init error:', err.message)
        return
      }
    }
  }
}

async function _initTables() {
  if (!client) return

  try {
    // Create tables if they don't exist
    await client`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        profile_image TEXT DEFAULT '',
        role TEXT NOT NULL DEFAULT 'user',
        invite_code TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        last_seen TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `
    await client`
      CREATE TABLE IF NOT EXISTS invite_codes (
        code TEXT PRIMARY KEY,
        created_by TEXT NOT NULL,
        label TEXT DEFAULT '',
        max_uses INTEGER NOT NULL DEFAULT 1,
        use_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `
    // Migrate old invite_codes table if needed
    try { await client`ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS max_uses INTEGER NOT NULL DEFAULT 1` } catch {}
    try { await client`ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS use_count INTEGER NOT NULL DEFAULT 0` } catch {}

    await client`
      CREATE TABLE IF NOT EXISTS invite_code_uses (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL,
        used_by TEXT NOT NULL,
        used_by_name TEXT NOT NULL,
        used_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `
    await client`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        expires_at TIMESTAMP NOT NULL
      )
    `
    await client`
      CREATE TABLE IF NOT EXISTS moments (
        id SERIAL PRIMARY KEY,
        channel TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        spike_at BIGINT NOT NULL,
        clip_start TEXT,
        clip_end TEXT,
        clip_start_url TEXT,
        clip_end_url TEXT,
        vod_timestamp TEXT,
        vod_url TEXT,
        jump_percent INTEGER NOT NULL,
        burst REAL NOT NULL,
        baseline REAL NOT NULL,
        mood TEXT,
        description TEXT,
        vibe TEXT NOT NULL,
        vibe_intensity REAL NOT NULL,
        clip_worthy BOOLEAN DEFAULT FALSE,
        clip_url TEXT,
        clip_id TEXT,
        chat_snapshot JSON DEFAULT '[]'
      )
    `
    await client`
      CREATE TABLE IF NOT EXISTS watched_channels (
        channel TEXT PRIMARY KEY,
        added_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `

    await client`
      CREATE TABLE IF NOT EXISTS llm_usage (
        id TEXT PRIMARY KEY DEFAULT 'global',
        total_input_tokens BIGINT NOT NULL DEFAULT 0,
        total_output_tokens BIGINT NOT NULL DEFAULT 0,
        total_calls INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `

    await client`
      CREATE TABLE IF NOT EXISTS twitch_tokens (
        user_id TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `

    await client`
      CREATE TABLE IF NOT EXISTS user_channels (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        added_at TIMESTAMP DEFAULT NOW() NOT NULL,
        confirmed BOOLEAN NOT NULL DEFAULT FALSE,
        confirmed_at TIMESTAMP
      )
    `

    await client`
      CREATE TABLE IF NOT EXISTS whitelist (
        username TEXT PRIMARY KEY,
        added_by TEXT NOT NULL,
        added_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `

    await client`
      CREATE TABLE IF NOT EXISTS markets_cache (
        pda TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        mood TEXT NOT NULL,
        window_start BIGINT NOT NULL,
        window_end BIGINT NOT NULL,
        state TEXT NOT NULL,
        total_yes BIGINT NOT NULL DEFAULT 0,
        total_no BIGINT NOT NULL DEFAULT 0,
        resolved_at BIGINT,
        synced_at TIMESTAMP DEFAULT NOW() NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `
    try { await client`CREATE INDEX IF NOT EXISTS idx_markets_cache_state ON markets_cache (state)` } catch {}
    try { await client`CREATE INDEX IF NOT EXISTS idx_markets_cache_channel_mood ON markets_cache (channel, mood)` } catch {}

    await client`
      CREATE TABLE IF NOT EXISTS user_wallets (
        user_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        linked_at TIMESTAMP DEFAULT NOW() NOT NULL,
        PRIMARY KEY (user_id, wallet_address)
      )
    `

    // Migrations
    try { await client`ALTER TABLE users ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMP` } catch {}
    try { await client`ALTER TABLE moments ADD COLUMN IF NOT EXISTS user_id TEXT` } catch {}

    // Deduplicate existing moments (keep one row per channel+spike_at, regardless of user_id)
    try {
      const deleted = await client`
        DELETE FROM moments WHERE id NOT IN (
          SELECT MIN(id) FROM moments GROUP BY channel, spike_at
        )
      `
      if (deleted.count > 0) console.log(`[db] Cleaned up ${deleted.count} duplicate moments`)
    } catch {}

    // Add unique index to prevent future duplicates (one row per channel+spikeAt)
    try { await client`DROP INDEX IF EXISTS idx_moments_unique_spike` } catch {}
    try { await client`CREATE UNIQUE INDEX IF NOT EXISTS idx_moments_unique_spike ON moments (channel, spike_at)` } catch {}

    console.log('[db] Tables initialized')
  } catch (err: any) {
    throw err
  }
}

export function hasDatabase(): boolean {
  return !!db
}
