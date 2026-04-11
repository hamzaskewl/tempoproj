export type Vibe =
  | 'funny'
  | 'hype'
  | 'awkward'
  | 'win'
  | 'loss'
  | 'rage'
  | 'shock'
  | 'clutch'
  | 'wholesome'
  | 'drama'
  | 'sad'
  | 'neutral'
  | 'error'

export interface User {
  id: string
  username: string
  profileImage?: string | null
  role: 'admin' | 'user'
}

export interface AuthMe {
  authenticated: boolean
  user?: User
}

export interface Spike {
  type?: string
  channel: string
  spikeAt?: number
  viewers?: number | null
  burst?: number
  baseline?: number
  jumpPercent: number
  vibe: Vibe
  vibeIntensity?: number
  chatSnapshot?: string[]
  game?: string | null
  streamTitle?: string | null
  vodTimestamp?: string | null
  vodUrl?: string | null
  detector?: 'v1' | 'v2'
  zScore?: number
  confidence?: number
}

export interface DashboardMoment {
  id: string
  dbId?: number
  channel: string
  jumpPercent: number
  viewers?: number | null
  vibe: Vibe
  mood?: string | null
  description?: string | null
  chatSnapshot?: string[]
  clipUrl?: string | null
  clipId?: string | null
  vodUrl?: string | null
  vodTimestamp?: string | null
  receivedAt: number
}

export interface MyChannel {
  channel: string
  confirmed: boolean
}

export interface Clip {
  id: number
  channel: string
  jumpPercent: number
  vibe: Vibe
  mood?: string | null
  description?: string | null
  clipUrl?: string | null
  vodUrl?: string | null
  timestamp: string
}

export interface ClipsResponse {
  clips: Clip[]
  filteredTotal: number
  stats: {
    total: number
    clipped: number
    topChannels: { channel: string; count: number }[]
  }
}

export interface TrendingChannel {
  channel: string
  burst: number
  vibe: Vibe
}

export interface Health {
  connected: boolean
  totalChannels?: number
  totalMsgsPerSec?: number
}

export interface ChannelStats {
  live: boolean
  viewers?: number
  rate?: number
  baseline?: number
  isSpike?: boolean
  jumpPercent?: number
}

export interface AdminStats {
  auth: { totalUsers: number; availableInvites: number }
  system: { totalChannels?: number; totalMsgsPerSec?: number }
  llm: { spent: number; remaining: number; limit: number; totalCalls: number }
}

export interface InviteCode {
  code: string
  label?: string | null
  useCount: number
  maxUses: number
  uses?: { usedByName: string }[]
}

export interface AdminUser {
  id: string
  username: string
  role: 'admin' | 'user'
  lastSeen: number
  createdAt: number
}

export interface DetailedUser {
  id: string
  username: string
  role: 'admin' | 'user'
  lastSeen: number
  createdAt: number
  hasOAuth: boolean
  clipsCreated: number
  momentsTotal: number
  channels: { channel: string; confirmed: boolean }[]
}

export interface WhitelistEntry {
  username: string
}
