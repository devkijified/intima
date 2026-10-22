'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Room, createLocalVideoTrack, createLocalAudioTrack, VideoPresets, type LocalVideoTrack, type LocalAudioTrack, type TrackPublishOptions } from 'livekit-client'
import { createClient } from '@/lib/supabase/client'
import { GiftFxLayer, type GiftFxHandle } from '@/components/live/GiftFx'
import { GiftMenuEditor } from '@/components/live/GiftMenuEditor'
import type { GiftFxEvent } from '@/components/live/giftTypes'
import { ngnForCoins } from '@/lib/utils/helpers'
import { Video, AlertCircle, Lock, Unlock, Mic, MicOff, Camera, RefreshCw, XCircle, Gift, Eye, Crown, CheckCircle } from '@/lib/icons'
import { Tooltip, HelpTip } from '@/components/ui/Tooltip'

// Simulcast ladder for the camera, stated on purpose rather than left
// to SDK defaults: the full capture (720p class on a phone) stays the
// top layer, with 360p and 180p layers under it. Viewers on weak
// networks get served a smaller layer instead of a stalled picture,
// and the viewer quality picker caps which layer a viewer takes.
const CAMERA_PUBLISH_OPTIONS: TrackPublishOptions = {
  simulcast: true,
  videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
}

type Phase = 'setup' | 'publishing' | 'live'
type AccessMode = 'public' | 'paid' | 'fans'

interface PremiumCheck {
  key: string
  label: string
  passed: boolean
  current: string
  target: string
}

export default function GoLivePage() {
  const [title, setTitle] = useState('')
  const [access, setAccess] = useState<AccessMode>('public')
  const [price, setPrice] = useState('')
  const [premium, setPremium] = useState<{ eligible: boolean; checks: PremiumCheck[] } | null>(null)
  const [showPremiumChecks, setShowPremiumChecks] = useState(false)
  const [phase, setPhase] = useState<Phase>('setup')
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [viewerCount, setViewerCount] = useState(0)
  const [giftCount, setGiftCount] = useState(0)
  const [giftEarnings, setGiftEarnings] = useState(0)
  const [muted, setMuted] = useState(false)
  const [ending, setEnding] = useState(false)
  const [schedWhen, setSchedWhen] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [schedMsg, setSchedMsg] = useState('')

  const router = useRouter()
  const fxRef = useRef<GiftFxHandle>(null)
  const roomRef = useRef<Room | null>(null)
  const videoEl = useRef<HTMLVideoElement>(null)
  const videoTrack = useRef<LocalVideoTrack | null>(null)
  const audioTrack = useRef<LocalAudioTrack | null>(null)

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      roomRef.current?.disconnect()
      videoTrack.current?.stop()
      audioTrack.current?.stop()
    }
  }, [])

  // Premium (fans only) is earned, not given: load her checklist so
  // the Premium option knows whether it is open or locked, and what
  // is left if it is locked. Same evaluator the server enforces with.
  useEffect(() => {
    fetch('/api/live/premium-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && Array.isArray(j.checks)) setPremium(j)
      })
      .catch(() => {})
  }, [])

  const choosePremium = async () => {
    if (premium?.eligible) {
      setAccess('fans')
      setShowPremiumChecks(false)
      return
    }
    setShowPremiumChecks(true)
    if (!premium) {
      try {
        const r = await fetch('/api/live/premium-status')
        if (r.ok) setPremium(await r.json())
      } catch { /* the checklist panel explains the wait */ }
    }
  }

  const handleGoLive = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPhase('publishing')
    const supabase = createClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const { data: profile } = await supabase
        .from('profiles').select('role, display_name').eq('id', user.id).maybeSingle()
      if (profile?.role !== 'model') throw new Error('Only companions can go live')

      let priceNgn = access === 'paid' ? Math.max(0, parseInt(price || '0', 10)) : 0
      if (access === 'paid' && priceNgn <= 0) throw new Error('Set a join price, or choose Public or Premium')

      // A scheduled session can be picked up with ?session=<id>: flip it
      // live through the go-live route (which sends the live_started
      // fanout) and publish into its pre-generated room instead of
      // creating a second session.
      const resumeId = new URLSearchParams(window.location.search).get('session')
      let session: { id: string }
      let resumed = false
      if (resumeId) {
        const { data: existing } = await supabase
          .from('live_sessions')
          .select('id, status, price_ngn, access_mode')
          .eq('id', resumeId)
          .eq('provider_id', user.id)
          .maybeSingle()
        if (!existing) throw new Error('Scheduled stream not found')
        if (existing.status === 'scheduled') {
          const gl = await fetch('/api/live/go-live', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: existing.id }),
          })
          if (!gl.ok) {
            const j = await gl.json().catch(() => ({}))
            throw new Error(j.error || 'Could not go live')
          }
        } else if (existing.status !== 'live') {
          throw new Error('This stream has ended')
        }
        priceNgn = existing.price_ngn ?? 0
        session = existing
        resumed = true
        // End any other live session of mine, but not this one.
        await supabase.from('live_sessions')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('provider_id', user.id).eq('status', 'live').neq('id', existing.id)
      } else {
        // Create the session through the start route: it ends any
        // prior live session, sets the room name, and judges the
        // access mode server-side (a fans stream needs the Premium
        // bar cleared, which only the server can enforce).
        const startRes = await fetch('/api/live/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim() || 'Live now',
            accessMode: access,
            priceNgn,
          }),
        })
        if (!startRes.ok) {
          const j = await startRes.json().catch(() => ({}))
          throw new Error(j.error || 'Could not start stream')
        }
        const startJson = await startRes.json()
        session = startJson.session
      }
      setSessionId(session.id)

      // Mint a publisher token.
      const tokRes = await fetch('/api/live/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, role: 'publisher' }),
      })
      if (!tokRes.ok) {
        const j = await tokRes.json().catch(() => ({}))
        throw new Error(j.error || 'Could not get stream token')
      }
      const { token, url } = await tokRes.json()

      // Camera + mic.
      const cam = await createLocalVideoTrack({ facingMode: 'user' })
      const mic = await createLocalAudioTrack()
      videoTrack.current = cam
      audioTrack.current = mic
      if (videoEl.current) {
        cam.attach(videoEl.current)
      }

      // Connect and publish.
      const room = new Room()
      roomRef.current = room
      room.on('participantConnected', () => setViewerCount(room.remoteParticipants.size))
      room.on('participantDisconnected', () => setViewerCount(room.remoteParticipants.size))
      await room.connect(url, token)
      await room.localParticipant.publishTrack(cam, CAMERA_PUBLISH_OPTIONS)
      await room.localParticipant.publishTrack(mic)

      // Notify past clients (best-effort, via the push+notification primitive).
      // Skipped for a resumed scheduled session: /api/live/go-live already
      // sent the live_started fanout when it flipped the status.
      try {
        if (!resumed) {
        const { data: clients } = await supabase.from('connections')
          .select('client_id').eq('provider_id', user.id).eq('status', 'active')
        const ids = [...new Set((clients ?? []).map((c: { client_id: string }) => c.client_id))]
        if (ids.length > 0) {
          await fetch('/api/push/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_ids: ids,
              type: 'live_started',
              title: (profile?.display_name ?? 'A companion') + ' is live',
              body: access === 'fans'
                ? 'Fans only: join her fan club to watch'
                : priceNgn > 0 ? 'Join for N' + priceNgn.toLocaleString() : 'Join free now',
              link: '/live/' + session.id,
            }),
          })
        }
        }
      } catch { /* best-effort */ }

      setPhase('live')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start stream')
      setPhase('setup')
      roomRef.current?.disconnect()
      videoTrack.current?.stop()
      audioTrack.current?.stop()
    }
  }

  // Schedule this stream for later instead of going live now.
  const handleSchedule = async () => {
    if (!schedWhen || scheduling) return
    setScheduling(true)
    setSchedMsg('')
    setError(null)
    try {
      const priceNgn = access === 'paid' ? Math.max(0, parseInt(price || '0', 10)) : 0
      if (access === 'paid' && priceNgn <= 0) throw new Error('Set a join price, or choose Public or Premium')
      const res = await fetch('/api/live/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'Live',
          scheduledFor: new Date(schedWhen).toISOString(),
          priceNgn,
          isPublic: access !== 'paid',
          accessMode: access,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not schedule')
      setSchedMsg('Scheduled. Find it under Upcoming on the live page, then tap Go live at the time.')
      setSchedWhen('')
    } catch (err: unknown) {
      setSchedMsg(err instanceof Error ? err.message : 'Could not schedule')
    } finally {
      setScheduling(false)
    }
  }

  // Track gift earnings while live, and run the same gift FX the
  // viewers see (the host watches her own stage effects).
  useEffect(() => {
    if (phase !== 'live' || !sessionId) return
    const supabase = createClient()
    let catalog: { id: string; name: string; emoji: string; coin_cost: number; anim_tier: GiftFxEvent['animTier'] }[] = []
    const nameCache = new Map<string, string>()
    const resolveSenderName = async (senderId: string): Promise<string> => {
      const hit = nameCache.get(senderId)
      if (hit) return hit
      const { data: sender } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', senderId)
        .maybeSingle()
      const name: string = sender?.display_name ?? 'Someone'
      nameCache.set(senderId, name)
      return name
    }
    supabase
      .from('gift_catalog')
      .select('id, name, emoji, coin_cost, anim_tier')
      .then(({ data }) => {
        catalog = (data ?? []) as typeof catalog
      })
    const ch = supabase
      .channel(`host-gifts-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gift_transactions', filter: `session_id=eq.${sessionId}` },
        async (payload) => {
          const row = payload.new as {
            id: string
            gift_id: string
            sender_id: string
            coin_cost: number
            host_earnings_coins: number
          }
          setGiftCount((n) => n + 1)
          setGiftEarnings((n) => n + (row.host_earnings_coins ?? 0))
          const gift = catalog.find((g) => g.id === row.gift_id)
          if (!gift) return
          const senderName = await resolveSenderName(row.sender_id)
          fxRef.current?.push({
            id: row.id,
            giftId: gift.id,
            name: gift.name,
            emoji: gift.emoji,
            animTier: gift.anim_tier ?? 'float',
            coinCost: gift.coin_cost,
            senderId: row.sender_id,
            senderName,
          })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [phase, sessionId])

  const toggleMute = async () => {
    if (!audioTrack.current) return
    const next = !muted
    if (next) await audioTrack.current.mute()
    else await audioTrack.current.unmute()
    setMuted(next)
  }

  const flipCamera = async () => {
    // Simplest reliable flip: restart the video track with the other facing mode.
    try {
      const current = videoTrack.current
      const facing = current?.mediaStreamTrack.getSettings().facingMode === 'user' ? 'environment' : 'user'
      const next = await createLocalVideoTrack({ facingMode: facing as 'user' | 'environment' })
      if (roomRef.current) {
        await roomRef.current.localParticipant.unpublishTrack(current!)
        await roomRef.current.localParticipant.publishTrack(next, CAMERA_PUBLISH_OPTIONS)
      }
      current?.stop()
      videoTrack.current = next
      if (videoEl.current) next.attach(videoEl.current)
    } catch { /* ignore */ }
  }

  const endStream = async () => {
    if (!sessionId || ending) return
    setEnding(true)
    const supabase = createClient()
    try {
      // The session row must actually flip to ended: an unchecked update
      // used to leave ended streams showing LIVE on the map and /live.
      const { error } = await supabase.from('live_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', sessionId)
      if (error) {
        await new Promise((r) => setTimeout(r, 1000))
        await supabase.from('live_sessions')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', sessionId)
      }
    } catch { /* retried above; leaving the room must never trap the host */ }
    roomRef.current?.disconnect()
    videoTrack.current?.stop()
    audioTrack.current?.stop()
    router.push(`/models/live/ended?id=${sessionId}`)
  }

  if (phase === 'setup' || phase === 'publishing') {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 pb-28 md:pb-10">
        <div className="rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-sm">
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-charcoal">
            <Video className="h-6 w-6 text-primary" /> Go Live
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Stream to your audience TikTok-style. You decide who gets in: everyone, ticket buyers, or your fans. Viewers can send you gifts.
          </p>
          <form onSubmit={handleGoLive} className="mt-6 space-y-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-charcoal">Stream title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Evening chat"
                maxLength={80} className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-base outline-none focus:border-primary md:text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-charcoal">Access</label>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => { setAccess('public'); setShowPremiumChecks(false) }}
                  className={'flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-3 text-sm font-semibold ' + (access === 'public' ? 'border-primary bg-primary/5 text-primary' : 'border-neutral-200 text-neutral-500')}>
                  <span className="flex items-center gap-1.5"><Unlock className="h-4 w-4" /> Public</span>
                  <span className="text-[11px] font-normal leading-tight text-neutral-400">Free for everyone</span>
                </button>
                <button type="button" onClick={() => { setAccess('paid'); setShowPremiumChecks(false) }}
                  className={'flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-3 text-sm font-semibold ' + (access === 'paid' ? 'border-gold bg-gold/10 text-charcoal' : 'border-neutral-200 text-neutral-500')}>
                  <span className="flex items-center gap-1.5"><Lock className="h-4 w-4" /> Paid</span>
                  <span className="text-[11px] font-normal leading-tight text-neutral-400">Ticket price</span>
                </button>
                <button type="button" onClick={choosePremium}
                  className={'flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-3 text-sm font-semibold ' + (access === 'fans' ? 'border-charcoal bg-charcoal text-white' : 'border-neutral-200 text-neutral-500')}>
                  <span className="flex items-center gap-1.5">
                    <Crown className="h-4 w-4" /> Premium
                    {premium && !premium.eligible && <Lock className="h-3 w-3 text-neutral-400" />}
                  </span>
                  <span className={'text-[11px] font-normal leading-tight ' + (access === 'fans' ? 'text-white/60' : 'text-neutral-400')}>Fans only</span>
                </button>
              </div>
              {access === 'fans' && (
                <p className="mt-2 text-xs text-neutral-400">
                  Only your fan club subscribers can enter. Everyone else sees the show listed with a Fans Only badge and a join prompt.
                </p>
              )}
              {showPremiumChecks && premium && !premium.eligible && (
                <div className="mt-3 rounded-2xl border border-neutral-200 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                    <Crown className="h-4 w-4 text-gold" aria-hidden /> Premium is earned, not given
                    <HelpTip text="Premium unlocks fans only streams. Each line below is a trust mark: a verified ID, enough completed connections, strong ratings, fast replies, few cancellations, and a fan club price set. When every line passes, Premium opens on its own." />
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Fans only shows are a reward for a proven track record. Here is where you stand:
                  </p>
                  <ul className="mt-3 space-y-2.5">
                    {premium.checks.map((c) => (
                      <li key={c.key} className="flex items-start gap-2 text-sm">
                        {c.passed
                          ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />}
                        <span className="flex-1 text-charcoal">
                          {c.label}
                          <span className="block text-xs text-neutral-400">
                            {c.passed ? c.current : `${c.current} · needs ${c.target}`}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {showPremiumChecks && !premium && (
                <p className="mt-3 text-xs text-neutral-400">Checking your Premium status...</p>
              )}
            </div>
            {access === 'paid' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-charcoal">Join price (N)</label>
                <input type="number" min={100} step={100} value={price} onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 2000" className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-base outline-none focus:border-primary md:text-sm" />
                <p className="mt-1 text-xs text-neutral-400">Viewers pay once to join. Your fan club subscribers enter free.</p>
              </div>
            )}
            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <button type="submit" disabled={phase === 'publishing'}
              className="flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary py-3 text-sm font-bold text-white disabled:opacity-50">
              {phase === 'publishing' ? 'Starting camera...' : 'Go live now'}
            </button>
            <div className="rounded-2xl border border-neutral-200 p-4">
              <label className="flex items-center gap-1 text-sm font-medium text-charcoal">
                Schedule for later
                <HelpTip text="Announce the stream now and it appears under Upcoming on the live page. When the time comes, open this console and go live as usual. Your followers get a notification the moment you start." />
              </label>
              <p className="mt-0.5 text-xs text-neutral-400">
                Same title, access, and price as above, but announced in Upcoming instead of starting now.
              </p>
              <input type="datetime-local" value={schedWhen} onChange={(e) => setSchedWhen(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary" />
              <button type="button" onClick={handleSchedule} disabled={!schedWhen || scheduling}
                className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-full bg-charcoal py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {scheduling ? 'Scheduling...' : 'Schedule stream'}
              </button>
              {schedMsg && <p className="mt-2 text-center text-xs text-neutral-500">{schedMsg}</p>}
            </div>
            <p className="text-center text-xs text-neutral-400">
              Your browser will ask for camera and microphone permission.
            </p>
          </form>
        </div>
        <GiftMenuEditor />
      </div>
    )
  }

  // Live host view.
  return (
    <div className="fixed inset-0 z-40 bg-black">
      <video ref={videoEl} autoPlay playsInline muted className="h-full w-full object-cover" />
      {/* Gift FX: the same tiered effects her viewers see */}
      <GiftFxLayer ref={fxRef} myId={null} />
      {/* Top bar */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          <Eye className="h-3.5 w-3.5" /> {viewerCount} watching
        </span>
      </div>
      {/* Gift earnings pill */}
      <div className="absolute left-4 top-16 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
        <Gift className="h-3.5 w-3.5 text-gold" />
        {giftCount} gifts · {giftEarnings.toLocaleString()} coins
        <span className="text-white/60">≈ {ngnForCoins(giftEarnings)}</span>
        <HelpTip
          side="bottom"
          text="This is your share of the gifts from this stream. Intima keeps half of every gift, so a 100 coin gift adds 50 coins here."
        />
      </div>
      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-4 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Tooltip label={muted ? 'Unmute' : 'Mute'}>
          <button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur active:scale-95">
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        </Tooltip>
        <Tooltip label="Flip camera">
          <button onClick={flipCamera} aria-label="Flip camera"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur active:scale-95">
            <RefreshCw className="h-5 w-5" />
          </button>
        </Tooltip>
        <Tooltip label="End stream">
          <button onClick={endStream} disabled={ending} aria-label="End stream"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg active:scale-95 disabled:opacity-50">
            <XCircle className="h-7 w-7" />
          </button>
        </Tooltip>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/0">
          <Camera className="hidden h-5 w-5" />
        </span>
      </div>
    </div>
  )
}
