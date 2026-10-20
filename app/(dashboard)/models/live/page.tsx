'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Room, createLocalVideoTrack, createLocalAudioTrack, type LocalVideoTrack, type LocalAudioTrack } from 'livekit-client'
import { createClient } from '@/lib/supabase/client'
import { Video, AlertCircle, Lock, Unlock, Mic, MicOff, Camera, RefreshCw, XCircle, Gift, Eye } from '@/lib/icons'

type Phase = 'setup' | 'publishing' | 'live'

export default function GoLivePage() {
  const [title, setTitle] = useState('')
  const [paid, setPaid] = useState(false)
  const [price, setPrice] = useState('')
  const [phase, setPhase] = useState<Phase>('setup')
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [viewerCount, setViewerCount] = useState(0)
  const [giftCount, setGiftCount] = useState(0)
  const [giftEarnings, setGiftEarnings] = useState(0)
  const [muted, setMuted] = useState(false)
  const [ending, setEnding] = useState(false)

  const router = useRouter()
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

      const priceNgn = paid ? Math.max(0, parseInt(price || '0', 10)) : 0
      if (paid && priceNgn <= 0) throw new Error('Set a join price, or choose free')

      // End any prior live session.
      await supabase.from('live_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('provider_id', user.id).eq('status', 'live')

      // Create the session with a LiveKit room name.
      const roomName = `intima-${user.id.slice(0, 8)}-${Date.now().toString(36)}`
      const { data: session, error: sessionError } = await supabase
        .from('live_sessions')
        .insert({
          provider_id: user.id,
          title: title.trim() || 'Live now',
          is_public: !paid,
          price_ngn: priceNgn,
          status: 'live',
          livekit_room: roomName,
        })
        .select('id')
        .single()
      if (sessionError) throw sessionError
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
      await room.localParticipant.publishTrack(cam)
      await room.localParticipant.publishTrack(mic)

      // Notify past clients (best-effort, via the push+notification primitive).
      try {
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
              body: priceNgn > 0 ? 'Join for N' + priceNgn.toLocaleString() : 'Join free now',
              link: '/live/' + session.id,
            }),
          })
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

  // Track gift earnings while live.
  useEffect(() => {
    if (phase !== 'live' || !sessionId) return
    const supabase = createClient()
    const ch = supabase
      .channel(`host-gifts-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gift_transactions', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as { coin_cost: number; host_earnings_coins: number }
          setGiftCount((n) => n + 1)
          setGiftEarnings((n) => n + (row.host_earnings_coins ?? 0))
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
        await roomRef.current.localParticipant.publishTrack(next)
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
      await supabase.from('live_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', sessionId)
    } catch { /* best-effort */ }
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
            Stream to your audience TikTok-style. You decide free or paid, and viewers can send you gifts.
          </p>
          <form onSubmit={handleGoLive} className="mt-6 space-y-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-charcoal">Stream title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Evening chat"
                maxLength={80} className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-charcoal">Access</label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setPaid(false)}
                  className={'flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ' + (!paid ? 'border-primary bg-primary/5 text-primary' : 'border-neutral-200 text-neutral-500')}>
                  <Unlock className="h-4 w-4" /> Free to join
                </button>
                <button type="button" onClick={() => setPaid(true)}
                  className={'flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ' + (paid ? 'border-gold bg-gold/10 text-charcoal' : 'border-neutral-200 text-neutral-500')}>
                  <Lock className="h-4 w-4" /> Pay to join
                </button>
              </div>
            </div>
            {paid && (
              <div>
                <label className="mb-1 block text-sm font-medium text-charcoal">Join price (N)</label>
                <input type="number" min={100} step={100} value={price} onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 2000" className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary" />
                <p className="mt-1 text-xs text-neutral-400">Viewers pay once to join. You keep 100%.</p>
              </div>
            )}
            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <button type="submit" disabled={phase === 'publishing'}
              className="w-full rounded-full bg-primary py-3 text-sm font-bold text-white disabled:opacity-50">
              {phase === 'publishing' ? 'Starting camera...' : 'Go live now'}
            </button>
            <p className="text-center text-xs text-neutral-400">
              Your browser will ask for camera and microphone permission.
            </p>
          </form>
        </div>
      </div>
    )
  }

  // Live host view.
  return (
    <div className="fixed inset-0 z-40 bg-black">
      <video ref={videoEl} autoPlay playsInline muted className="h-full w-full object-cover" />
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
      </div>
      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-4 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur active:scale-95">
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <button onClick={flipCamera} aria-label="Flip camera"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur active:scale-95">
          <RefreshCw className="h-5 w-5" />
        </button>
        <button onClick={endStream} disabled={ending} aria-label="End stream"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg active:scale-95 disabled:opacity-50">
          <XCircle className="h-7 w-7" />
        </button>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/0">
          <Camera className="hidden h-5 w-5" />
        </span>
      </div>
    </div>
  )
}
