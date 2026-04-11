'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { Topbar } from '@/components/Topbar'
import { VibeTag } from '@/components/VibeTag'
import { AuthGuard } from '@/components/AuthGuard'
import { ChannelSlot } from './components/ChannelSlot'
import { MomentCard } from './components/MomentCard'
import { ConfirmedChannelStats } from './components/ConfirmedChannelStats'
import { useSSE } from '@/lib/useSSE'
import { swrFetcher, getJSON, postJSON, deleteJSON } from '@/lib/api'
import { mergeMoments } from '@/lib/merge-moments'
import type { DashboardMoment, Health, MyChannel, TrendingChannel, Vibe } from '@/lib/types'

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardInner />
    </AuthGuard>
  )
}

interface MomentsResponse {
  moments: Array<{
    id: number; channel: string; jumpPercent: number; vibe: Vibe
    mood?: string | null; description?: string | null; chatSnapshot?: string[]
    clipUrl?: string | null; clipId?: string | null
    vodUrl?: string | null; vodTimestamp?: string | null; spikeAt: number
  }>
}

function DashboardInner() {
  const [userChannels, setUserChannels] = useState<MyChannel[]>([])
  const [moments, setMoments] = useState<DashboardMoment[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [embedVisible, setEmbedVisible] = useState<Set<string>>(new Set())
  const [filterChannel, setFilterChannel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [addInput, setAddInput] = useState('')
  const [oauthDisconnected, setOauthDisconnected] = useState(false)
  const [, forceTick] = useState(0)
  const userChannelsRef = useRef<MyChannel[]>([])
  userChannelsRef.current = userChannels

  const { data: health } = useSWR<Health>('/health', swrFetcher, { refreshInterval: 5000 })
  const { data: trending } = useSWR<{ channels: TrendingChannel[] }>('/trending', swrFetcher, { refreshInterval: 15000 })

  const loadChannels = useCallback(async () => {
    try { const data = await getJSON<{ channels: MyChannel[] }>('/my/channels'); setUserChannels(data.channels || []) } catch {}
  }, [])

  const loadMomentsFromDB = useCallback(async () => {
    try { const data = await getJSON<MomentsResponse>('/my/moments?limit=100'); setMoments((cur) => mergeMoments(cur, data.moments)) } catch {}
  }, [])

  useEffect(() => {
    loadChannels()
    loadMomentsFromDB()
    const id1 = setInterval(loadChannels, 30000)
    const id2 = setInterval(() => forceTick((n) => n + 1), 10000)
    return () => { clearInterval(id1); clearInterval(id2) }
  }, [loadChannels, loadMomentsFromDB])

  useSSE('/alerts', (data: any) => {
    if (data?.type !== 'spike') return
    const myChannels = userChannelsRef.current.map((c) => c.channel)
    if (myChannels.length === 0 || !myChannels.includes(data.channel.toLowerCase())) return
    const id = `live-${Date.now()}-${Math.random()}`
    const newSpike: DashboardMoment = {
      id, channel: data.channel, jumpPercent: data.jumpPercent, viewers: data.viewers ?? null,
      vibe: data.vibe, mood: null, description: null, chatSnapshot: data.chatSnapshot || [],
      clipUrl: null, clipId: null, vodUrl: data.vodUrl ?? null, vodTimestamp: data.vodTimestamp ?? null, receivedAt: Date.now(),
    }
    setMoments((cur) => mergeMoments([newSpike, ...cur], []))
    setTimeout(() => fetchMomentForSpike(id, data.channel), 4000)
    setTimeout(() => fetchMomentForSpike(id, data.channel), 10000)
  })

  const fetchMomentForSpike = useCallback(async (spikeId: string, channel: string) => {
    try {
      const m = await getJSON<{ id: number; clipUrl?: string | null; mood?: string | null; description?: string | null; chatSnapshot?: string[] }>(`/moments/latest/${channel}`)
      setMoments((cur) => cur.map((s) => {
        if (s.id !== spikeId) return s
        return { ...s, dbId: m.id ?? s.dbId, clipUrl: m.clipUrl ?? s.clipUrl,
          mood: m.mood && m.mood !== 'error' ? m.mood : s.mood,
          description: m.mood && m.mood !== 'error' ? m.description ?? s.description : s.description,
          chatSnapshot: m.chatSnapshot && m.chatSnapshot.length > (s.chatSnapshot?.length || 0) ? m.chatSnapshot : s.chatSnapshot }
      }))
    } catch {}
  }, [])

  const channelOptions = useMemo(() => Array.from(new Set(userChannels.map((c) => c.channel))), [userChannels])
  const filteredMoments = useMemo(() => filterChannel ? moments.filter((s) => s.channel.toLowerCase() === filterChannel) : moments, [moments, filterChannel])

  async function addChannel() {
    const ch = addInput.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''); setAddInput('')
    if (!ch) return; setError(null)
    try { const data = await postJSON<{ channels: MyChannel[] }>('/my/channels', { channel: ch }); setUserChannels(data.channels || []); fetch(`/api/track/${ch}`, { method: 'POST', credentials: 'include' }).catch(() => {}) }
    catch (e: any) { setError(e?.message || 'Failed to add channel'); setTimeout(() => setError(null), 5000) }
  }
  async function removeChannel(ch: string) {
    setError(null)
    try { const data = await deleteJSON<{ channels: MyChannel[] }>(`/my/channels/${ch}`); setUserChannels(data.channels || []); fetch(`/api/track/${ch}`, { method: 'DELETE', credentials: 'include' }).catch(() => {}) } catch {}
  }
  async function confirmChannel(ch: string) {
    setError(null)
    try { const data = await postJSON<{ channels: MyChannel[] }>(`/my/channels/${ch}/confirm`); setUserChannels(data.channels || []) }
    catch (e: any) { setError(e?.message || 'Failed to confirm channel'); setTimeout(() => setError(null), 5000) }
  }
  async function quickAdd(ch: string) {
    if (userChannels.length >= 3) { setError('All 3 slots in use — remove one first'); setTimeout(() => setError(null), 5000); return }
    if (userChannels.some((c) => c.channel === ch)) { setError(`Already watching ${ch}`); setTimeout(() => setError(null), 5000); return }
    setAddInput(ch); setTimeout(addChannel, 0)
  }
  async function disconnectOAuth() {
    if (!confirm("Disconnect your Twitch OAuth? This will stop all clip creation from your account. You'll need to re-login to reconnect.")) return
    try { const res = await fetch('/api/my/token', { method: 'DELETE', credentials: 'include' }); if (res.ok) setOauthDisconnected(true) } catch {}
  }

  const slotsLeft = userChannels.length < 3
  const live = health?.connected ?? false

  return (
    <>
      <Topbar status={{ live, label: live ? 'live' : 'connecting...' }} showLogout />
      <div className="grid lg:grid-cols-[1fr_340px] min-h-[calc(100vh-53px)]">
        <div className="px-4 md:px-8 py-6 overflow-y-auto">
          <div className="bg-[#2a1800] border border-[#f59e0b55] rounded px-[18px] py-[12px] mb-3 text-[13px] leading-relaxed text-[#fbbf24]">
            <strong className="text-[#f59e0b]">heads up:</strong> clips are created using <strong>your Twitch account</strong> and will keep generating in the background even when your browser is closed. to stop, remove the channel from your watchlist below.
          </div>
          <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-lg px-[18px] py-[18px] mb-6 text-[13px] text-[#555] leading-relaxed flex items-center gap-3">
            <span className="text-[18px] text-[#9146ff]">*</span>
            <span><b className="text-[#888]">Free early access.</b> You have <b className="text-[#888]">3 channel slots</b> for live auto-clipping. Add a channel, then <b className="text-[#888]">confirm</b> it when the stream goes live. Channels persist across sessions but must be re-confirmed each time a stream starts.</span>
          </div>
          {error && <div className="bg-[#1a0a0a] border border-[#331111] rounded px-[18px] py-[12px] text-[13px] text-[#f87171] mb-4">{error}</div>}
          <div className="flex justify-between items-center mb-4">
            <div className="text-[12px] font-medium uppercase tracking-[2px] text-[#444]">your channels</div>
            <div className="text-[13px] text-[#555]"><b className="text-white">{userChannels.length}</b> / <b className="text-white">3</b> slots used</div>
          </div>
          <div className="flex gap-2 mb-7 flex-col md:flex-row">
            <input type="text" value={addInput} onChange={(e) => setAddInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addChannel()}
              placeholder={slotsLeft ? 'add a channel (e.g. xqc, pokimane)...' : 'all 3 slots in use — remove one first'} disabled={!slotsLeft}
              className="flex-1 bg-[#111] border border-[#1a1a1a] focus:border-[#333] rounded-md px-4 py-3 text-white text-[15px] outline-none transition-colors placeholder:text-[#222] disabled:opacity-50" />
            <button onClick={addChannel} disabled={!slotsLeft} className="bg-[#1a1a1a] hover:bg-[#222] text-[#888] hover:text-white border border-[#222] rounded-md px-5 py-3 text-[14px] disabled:opacity-30 disabled:cursor-not-allowed">add</button>
          </div>
          <div className="flex flex-col gap-2 mb-7">
            {userChannels.length === 0
              ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-[#111] border border-dashed border-[#1a1a1a] rounded-lg p-6 flex items-center justify-center text-[#222] text-[14px]">slot {i + 1} — empty</div>)
              : (<>{userChannels.map((ch) => <ChannelSlot key={ch.channel} ch={ch} onConfirm={() => confirmChannel(ch.channel)} onRemove={() => removeChannel(ch.channel)} />)}
                  {Array.from({ length: 3 - userChannels.length }).map((_, i) => <div key={`empty-${i}`} className="bg-[#111] border border-dashed border-[#1a1a1a] rounded-lg p-6 flex items-center justify-center text-[#222] text-[14px]">slot {userChannels.length + i + 1} — empty</div>)}</>)}
          </div>
          <div className="flex justify-between items-center mb-3">
            <div className="text-[12px] font-medium uppercase tracking-[2px] text-[#444] flex items-center gap-2">your moments <span className="bg-[#1a1a1a] text-[#555] text-[12px] px-[8px] py-[1px] rounded">{filteredMoments.length}</span></div>
            <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)} className="bg-[#111] border border-[#1a1a1a] rounded text-[#888] text-[13px] px-2 py-1 outline-none">
              <option value="">all channels</option>
              {channelOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            {filteredMoments.length === 0
              ? <div className="text-[#1a1a1a] text-[14px] py-8 text-center"><span className="pulse">{userChannels.filter((c) => c.confirmed).length === 0 ? 'add and confirm channels to start watching' : `watching ${userChannels.filter((c) => c.confirmed).map((c) => c.channel).join(', ')} — no moments yet`}</span></div>
              : filteredMoments.map((s) => <MomentCard key={s.id} m={s} open={expandedId === s.id} embedVisible={embedVisible.has(s.id)} onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)} onToggleEmbed={() => { setEmbedVisible((cur) => { const next = new Set(cur); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); return next }) }} />)}
          </div>
        </div>
        <div className="border-t lg:border-t-0 lg:border-l border-[#141414] p-4 md:p-6 overflow-y-auto bg-[#0c0c0c]">
          <ConfirmedChannelStats channels={userChannels.filter((c) => c.confirmed)} />
          <div className="mb-7">
            <div className="text-[12px] font-medium uppercase tracking-[2px] text-[#444] mb-3">trending</div>
            <div className="flex flex-col gap-1">
              {!trending?.channels?.length ? <div className="text-[#1a1a1a] text-[14px] py-4 text-center">loading...</div> :
                trending.channels.map((ch) => <div key={ch.channel} onClick={() => quickAdd(ch.channel.toLowerCase())} className="flex justify-between items-center px-[18px] py-[12px] bg-[#111] border border-[#161616] rounded-md text-[14px] cursor-pointer hover:border-[#333]">
                  <span className="font-medium text-white truncate max-w-[140px]">{ch.channel}</span>
                  <span className="text-[#555] text-[13px] flex items-center"><b className="text-[#ccc]">{ch.burst}</b><span className="ml-1">msg/s</span><VibeTag vibe={ch.vibe} className="ml-[8px]" /></span>
                </div>)}
            </div>
          </div>
          <div className="mb-7">
            <div className="text-[12px] font-medium uppercase tracking-[2px] text-[#444] mb-3">account</div>
            <div className="bg-[#111] border border-[#161616] rounded-md p-[14px]">
              <div className="text-[13px] text-[#555] mb-[12px]">Clips are created using your Twitch OAuth. You can disconnect to stop all clip creation from your account.</div>
              <button onClick={disconnectOAuth} disabled={oauthDisconnected} className="w-full bg-transparent border border-[#ef444444] text-[#ef4444] text-[12px] py-[8px] rounded disabled:border-[#222] disabled:text-[#333] disabled:cursor-not-allowed">{oauthDisconnected ? 'disconnected' : 'disconnect Twitch OAuth'}</button>
              <div className="text-[12px] text-[#333] mt-2 text-center">You can also revoke access at{' '}<a href="https://www.twitch.tv/settings/connections" target="_blank" rel="noreferrer" className="text-[#9146ff]">twitch.tv/settings/connections</a></div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
