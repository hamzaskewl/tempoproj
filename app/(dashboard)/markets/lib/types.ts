export interface MarketRow {
  pda: string
  channel: string
  mood: string
  windowStart: number
  windowEnd: number
  state: 'open' | 'yes' | 'no'
  totalYes: string
  totalNo: string
  resolvedAt: number | null
  syncedAt?: string
}
