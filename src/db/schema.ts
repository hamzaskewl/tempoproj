import { pgTable, text, timestamp, integer, real, boolean, json, serial, bigint } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),                    // Twitch user ID
  username: text('username').notNull(),
  profileImage: text('profile_image').default(''),
  role: text('role').notNull().default('user'),    // 'admin' | 'user'
  inviteCode: text('invite_code').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastSeen: timestamp('last_seen').defaultNow().notNull(),
})

export const inviteCodes = pgTable('invite_codes', {
  code: text('code').primaryKey(),
  createdBy: text('created_by').notNull(),
  label: text('label').default(''),
  usedBy: text('used_by'),
  usedByName: text('used_by_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  usedAt: timestamp('used_at'),
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
