import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.warn('[db] DATABASE_URL not set — running without persistence (in-memory only)')
}

const client = DATABASE_URL ? postgres(DATABASE_URL, { max: 10 }) : null

export const db = client ? drizzle(client, { schema }) : null

// Auto-create tables on first connect
export async function initDatabase() {
  if (!db || !client) {
    console.log('[db] No database configured — skipping init')
    return
  }

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
        used_by TEXT,
        used_by_name TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        used_at TIMESTAMP
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
    console.log('[db] Tables initialized')
  } catch (err: any) {
    console.error('[db] Init error:', err.message)
  }
}

export function hasDatabase(): boolean {
  return !!db
}
