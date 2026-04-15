import { pgTable, text, timestamp, integer, real, boolean, json, serial, bigint, primaryKey } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),                    // Twitch user ID
  username: text('username').notNull(),
  profileImage: text('profile_image').default(''),
  role: text('role').notNull().default('user'),    // 'admin' | 'user'
  inviteCode: text('invite_code').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastSeen: timestamp('last_seen').defaultNow().notNull(),
  tosAcceptedAt: timestamp('tos_accepted_at'),
})

export const inviteCodes = pgTable('invite_codes', {
  code: text('code').primaryKey(),
  createdBy: text('created_by').notNull(),
  label: text('label').default(''),
  maxUses: integer('max_uses').notNull().default(1),
  useCount: integer('use_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const inviteCodeUses = pgTable('invite_code_uses', {
  id: serial('id').primaryKey(),
  code: text('code').notNull(),
  usedBy: text('used_by').notNull(),
  usedByName: text('used_by_name').notNull(),
  usedAt: timestamp('used_at').defaultNow().notNull(),
})

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
})

export const moments = pgTable('moments', {
  id: serial('id').primaryKey(),
  channel: text('channel').notNull(),
  userId: text('user_id'),
  timestamp: timestamp('timestamp').notNull(),
  spikeAt: bigint('spike_at', { mode: 'number' }).notNull(),
  clipStart: text('clip_start'),
  clipEnd: text('clip_end'),
  clipStartUrl: text('clip_start_url'),
  clipEndUrl: text('clip_end_url'),
  vodTimestamp: text('vod_timestamp'),
  vodUrl: text('vod_url'),
  jumpPercent: integer('jump_percent').notNull(),
  burst: real('burst').notNull(),
  baseline: real('baseline').notNull(),
  mood: text('mood'),
  description: text('description'),
  vibe: text('vibe').notNull(),
  vibeIntensity: real('vibe_intensity').notNull(),
  clipWorthy: boolean('clip_worthy').default(false),
  clipUrl: text('clip_url'),
  clipId: text('clip_id'),
  chatSnapshot: json('chat_snapshot').$type<string[]>().default([]),
})

export const watchedChannels = pgTable('watched_channels', {
  channel: text('channel').primaryKey(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
})

export const llmUsage = pgTable('llm_usage', {
  id: text('id').primaryKey().default('global'),
  totalInputTokens: bigint('total_input_tokens', { mode: 'number' }).notNull().default(0),
  totalOutputTokens: bigint('total_output_tokens', { mode: 'number' }).notNull().default(0),
  totalCalls: integer('total_calls').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const twitchTokens = pgTable('twitch_tokens', {
  userId: text('user_id').primaryKey(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const whitelist = pgTable('whitelist', {
  username: text('username').primaryKey(),
  addedBy: text('added_by').notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
})

export const userChannels = pgTable('user_channels', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  channel: text('channel').notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
  confirmed: boolean('confirmed').notNull().default(false),
  confirmedAt: timestamp('confirmed_at'),
})

export const marketsCache = pgTable('markets_cache', {
  pda: text('pda').primaryKey(),                          // Market PDA base58
  channel: text('channel').notNull(),
  mood: text('mood').notNull(),
  windowStart: bigint('window_start', { mode: 'number' }).notNull(),
  windowEnd: bigint('window_end', { mode: 'number' }).notNull(),
  state: text('state').notNull(),                         // 'open' | 'yes' | 'no'
  totalYes: bigint('total_yes', { mode: 'bigint' }).notNull().default(0n),
  totalNo:  bigint('total_no',  { mode: 'bigint' }).notNull().default(0n),
  resolvedAt: bigint('resolved_at', { mode: 'number' }),
  syncedAt: timestamp('synced_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const userWallets = pgTable('user_wallets', {
  userId: text('user_id').notNull().references(() => users.id),
  walletAddress: text('wallet_address').notNull(),
  linkedAt: timestamp('linked_at').defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.walletAddress] }),
}))
