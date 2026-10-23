'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Room, LocalVideoTrack, LocalAudioTrack, createLocalVideoTrack, createLocalAudioTrack, VideoPresets, type TrackPublishOptions } from 'livekit-client'
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

type MediaDeviceKind = 'camera' | 'microphone'

// Tag a media failure with the device that caused it, so the
// message can name the actual problem instead of "camera or
// microphone" (which left the companion guessing which one).
function withDevice(err: unknown, device: MediaDeviceKind): unknown {
  if (err && typeof err === 'object') {
    ;(err as { device?: MediaDeviceKind }).device = device
  }
  return err
}

// Media failures also go to the error log with the browser's exact
// error name: when a companion reports "it still blocks", the real
// reason from her phone is on record instead of a guess.
function logMediaFail(where: string, err: unknown) {
  const e = err as { name?: string; message?: string; device?: string } | null
  void fetch('/api/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `studio media fail (${where}): device=${e?.device ?? '?'} name=${e?.name ?? 'unknown'} msg=${e?.message ?? ''} ua=${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
      route: '/models/live',
    }),
  }).catch(() => {})
}

// Camera and microphone failures reach the page as raw browser
// DOMExceptions ("The request is not allowed by the user agent or
// the platform in the current context..."). Those sentences are
// never shown to a companion: map them to plain instructions that
// name the device that actually failed.
function friendlyMediaError(err: unknown, deviceArg?: MediaDeviceKind): string {
  const name = (err as { name?: string } | null)?.name ?? ''
  const msg = err instanceof Error ? err.message : ''
  const text = `${name} ${msg}`
  const device: MediaDeviceKind =
    deviceArg ?? (err as { device?: MediaDeviceKind } | null)?.device ?? 'camera'
  if (/NotAllowedError|user agent|denied permission|permission denied/i.test(text)) {
    return device === 'microphone'
      ? 'Your microphone is blocked. If you are on a phone or WhatsApp call, end the call and try again. Otherwise allow microphone access for this site in your browser settings.'
      : 'Your camera is blocked. Allow camera access for this site in your browser settings, then try again. If another app is using your camera, close it first.'
  }
  if (/NotFoundError|OverconstrainedError|DevicesNotFound/i.test(text)) {
    return device === 'microphone'
      ? 'No microphone was found on this device.'
      : 'No camera was found on this device.'
  }
  if (/NotReadableError|TrackStartError/i.test(text)) {
    return device === 'microphone'
      ? 'Your microphone is busy. If you are on a phone or WhatsApp call, end the call and try again.'
      : 'Your camera is busy in another app. Close that app and try again.'
  }
  if (/SecurityError/i.test(text)) {
    return 'Camera and microphone access needs a secure connection. Open Intima from its usual address and try again.'
  }
  return device === 'microphone'
    ? 'The microphone could not start. Check it and try again.'
    : 'The camera could not start. Check it and try again.'
}

function humanStartError(err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? ''
  const raw = err instanceof Error ? err.message : ''
  if (
    err instanceof DOMException ||
    /NotAllowedError|NotFoundError|NotReadableError|OverconstrainedError|SecurityError/.test(name) ||
    /user agent|denied permission|getUserMedia/i.test(raw)
  ) {
    return friendlyMediaError(err)
  }
  if (raw === 'Not logged in') return 'Your session has expired. Sign in again, then go live.'
  if (/connect|websocket|signal/i.test(raw) && raw.length > 60) {
    return 'Could not connect to the streaming server. Check your internet connection and try again.'
  }
  return raw || 'Something went wrong starting your stream. Please try again.'
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

  // Pre-live preview: the camera starts on the setup screen, from a
  // direct tap, so the companion sees herself before anything is
  // streaming, and Go live now publishes tracks that are already
  // running instead of asking for the camera mid-flow (which iOS
  // Safari refuses once the tap is spent on network round trips).
  const [previewOn, setPreviewOn] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [micWarning, setMicWarning] = useState<string | null>(null)
  const [micBlocked, setMicBlocked] = useState(false)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const previewVideoEl = useRef<HTMLVideoElement>(null)
  const previewStream = useRef<MediaStream | null>(null)

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
      previewStream.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // The live stage mounts only when the phase flips to live, so the
  // local track can only attach to its video element after that
  // render. Without this the host watched a black stage while her
  // viewers saw the stream fine.
  useEffect(() => {
    if (phase === 'live' && videoEl.current && videoTrack.current) {
      videoTrack.current.attach(videoEl.current)
    }
  }, [phase])

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

  const startPreview = async () => {
    setPreviewError(null)
    setMicWarning(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setPreviewError('Camera access needs a secure connection. Open Intima from its usual address and try again.')
      return
    }
    // Camera and microphone are asked for SEPARATELY. As one bundle,
    // a blocked microphone (an active phone call is the usual
    // cause on iPhone) killed the camera too, and the error could
    // not even say which device had failed.
    // Called directly from the tap: iOS Safari ties the permission
    // to the gesture, so nothing may be awaited first.
    let videoStream: MediaStream
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
      })
    } catch (err) {
      logMediaFail('preview-camera', withDevice(err, 'camera'))
      setPreviewError(friendlyMediaError(err, 'camera'))
      return
    }
    const tracks = [...videoStream.getVideoTracks()]
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      tracks.push(...audioStream.getAudioTracks())
    } catch (err) {
      logMediaFail('preview-mic', withDevice(err, 'microphone'))
      setMicWarning('Your microphone is blocked, so there is no sound. If you are on a phone or WhatsApp call, end it and turn the camera on again. You can still go live, but viewers will not hear you until the microphone works.')
    }
    const stream = new MediaStream(tracks)
    previewStream.current = stream
    setPreviewOn(true)
    if (previewVideoEl.current) {
      previewVideoEl.current.srcObject = stream
      void previewVideoEl.current.play().catch(() => {})
    }
  }

  const stopPreview = () => {
    previewStream.current?.getTracks().forEach((t) => t.stop())
    previewStream.current = null
    if (previewVideoEl.current) previewVideoEl.current.srcObject = null
    setPreviewOn(false)
  }

  const flipPreview = async () => {
    const next = facing === 'user' ? 'environment' : 'user'
    setFacing(next)
    const stream = previewStream.current
    if (!stream) return
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: next } })
      const newTrack = fresh.getVideoTracks()[0]
      const old = stream.getVideoTracks()[0]
      if (old) {
        stream.removeTrack(old)
        old.stop()
      }
      if (newTrack) stream.addTrack(newTrack)
      if (previewVideoEl.current) {
        previewVideoEl.current.srcObject = stream
        void previewVideoEl.current.play().catch(() => {})
      }
    } catch (err) {
      logMediaFail('preview-flip', withDevice(err, 'camera'))
      setPreviewError(friendlyMediaError(err, 'camera'))
    }
  }

  // Tracks for publishing: reuse the running preview tracks when
  // the preview is on (the camera ask already happened on a direct
  // tap, so Safari cannot refuse it here), otherwise ask now. The
  // microphone is best-effort: a blocked mic (an active call is the
  // usual cause) must not stop the stream. She goes live on camera
  // alone, with a notice in the room and a Try mic button.
  const acquireTracks = async (): Promise<{ cam: LocalVideoTrack; mic: LocalAudioTrack | null; fromPreview: boolean }> => {
    const stream = previewStream.current
    const v = stream?.getVideoTracks()[0]
    if (stream && v && v.readyState === 'live') {
      const a = stream.getAudioTracks()[0]
      let mic: LocalAudioTrack | null = null
      if (a && a.readyState === 'live') {
        mic = new LocalAudioTrack(a)
      } else {
        // The preview ran without a mic. Try once more now:
        // whatever blocked it may have cleared since.
        try {
          mic = await createLocalAudioTrack()
        } catch (err) {
          logMediaFail('golive-mic-retry', withDevice(err, 'microphone'))
          mic = null
        }
      }
      return { cam: new LocalVideoTrack(v), mic, fromPreview: true }
    }
    let cam: LocalVideoTrack
    try {
      cam = await createLocalVideoTrack({ facingMode: facing })
    } catch (err) {
      throw withDevice(err, 'camera')
    }
    let mic: LocalAudioTrack | null = null
    try {
      mic = await createLocalAudioTrack()
    } catch (err) {
      logMediaFail('golive-mic', withDevice(err, 'microphone'))
      mic = null
    }
    return { cam, mic, fromPreview: false }
  }

  const handleGoLive = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    // Validate the price before any camera work starts.
    if (access === 'paid' && Math.max(0, parseInt(price || '0', 10)) <= 0) {
      setError('Set a join price, or choose Public or Premium')
      return
    }
    setPhase('publishing')
    // Ask for the camera FIRST, before any await: iOS Safari only
    // honours the request while it is still tied to this tap. The
    // old flow did the session and token round trips first, and
    // Safari then refused with a raw NotAllowedError even when the
    // site already had camera access allowed.
    const mediaBox: { cam: LocalVideoTrack | null; mic: LocalAudioTrack | null; fromPreview: boolean } = { cam: null, mic: null, fromPreview: false }
    let handedOff = false
    const mediaPromise = acquireTracks().then((m) => {
      mediaBox.cam = m.cam
      mediaBox.mic = m.mic
      mediaBox.fromPreview = m.fromPreview
      return m
    })
    mediaPromise.catch(() => { /* observed for real at the await below */ })
    const supabase = createClient()
    // Set once this attempt has created (or flipped live) a
    // session row, so a failure can put the row right instead of
    // leaving a ghost LIVE listing behind.
    let startedSessionId: string | null = null
    let startedWasResumed = false
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const { data: profile } = await supabase
        .from('profiles').select('role, display_name').eq('id', user.id).maybeSingle()
      if (!['model', 'admin', 'super_admin'].includes(profile?.role ?? '')) throw new Error('Only companions can go live')

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
      startedSessionId = session.id
      startedWasResumed = resumed

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

      // Camera + mic: the tracks requested at the top of this
      // handler (the running preview tracks when the preview is
      // on). From here LiveKit owns them.
      const media = await mediaPromise
      handedOff = true
      const cam = media.cam
      const mic = media.mic
      videoTrack.current = cam
      audioTrack.current = mic
      setMicBlocked(!mic)
      if (videoEl.current) {
        cam.attach(videoEl.current)
      }

      // Connect and publish. Video always; audio only when a mic
      // track exists (a blocked mic goes live silent, with the
      // in-room notice, instead of not going live at all).
      const room = new Room()
      roomRef.current = room
      room.on('participantConnected', () => setViewerCount(room.remoteParticipants.size))
      room.on('participantDisconnected', () => setViewerCount(room.remoteParticipants.size))
      await room.connect(url, token)
      await room.localParticipant.publishTrack(cam, CAMERA_PUBLISH_OPTIONS)
      if (mic) await room.localParticipant.publishTrack(mic)

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
      logMediaFail('golive', err)
      setError(humanStartError(err))
      setPhase('setup')
      // A stream that never reached live must not stay listed as
      // LIVE (a blocked camera used to leave exactly that ghost
      // behind). A fresh session is ended; a resumed scheduled
      // one goes back to scheduled for its real time.
      if (startedSessionId) {
        try {
          if (startedWasResumed) {
            await supabase.from('live_sessions')
              .update({ status: 'scheduled' })
              .eq('id', startedSessionId).eq('status', 'live')
          } else {
            await supabase.from('live_sessions')
              .update({ status: 'ended', ended_at: new Date().toISOString() })
              .eq('id', startedSessionId).eq('status', 'live')
          }
        } catch { /* best-effort; the row can still be ended by hand */ }
      }
      roomRef.current?.disconnect()
      roomRef.current = null
      if (handedOff) {
        // LiveKit had the tracks: stop them and drop the preview,
        // whose tracks are the same ones. She taps Turn on camera
        // to preview again before the next attempt.
        videoTrack.current?.stop()
        audioTrack.current?.stop()
        videoTrack.current = null
        audioTrack.current = null
        previewStream.current = null
        setPreviewOn(false)
      } else if (mediaBox.cam && !mediaBox.fromPreview) {
        // The start failed before publishing: stop the fresh
        // tracks so the camera does not stay on with nothing to
        // show. A running preview is left exactly as it was.
        mediaBox.cam.stop()
        mediaBox.mic?.stop()
      }
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

  // Went live without a microphone (it was blocked at start). One
  // tap asks again: if the blocker cleared (call ended, permission
  // fixed), the mic publishes into the running stream.
  const retryMic = async () => {
    if (!roomRef.current) return
    try {
      const mic = await createLocalAudioTrack()
      await roomRef.current.localParticipant.publishTrack(mic)
      audioTrack.current = mic
      setMicBlocked(false)
      setMuted(false)
    } catch (err) {
      logMediaFail('live-retry-mic', withDevice(err, 'microphone'))
    }
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

          {/* Pre-live preview: check the picture before anyone sees
              it. Nothing streams from here; publishing starts only
              at Go live now, reusing these same tracks. */}
          <div className="relative mt-6 h-72 w-full overflow-hidden rounded-2xl bg-neutral-900">
            <video ref={previewVideoEl} autoPlay playsInline muted className="h-full w-full object-cover" />
            {!previewOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <button type="button" onClick={startPreview}
                  className="flex min-h-[44px] items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-charcoal transition-transform active:scale-[0.98]">
                  <Video className="h-4 w-4" /> Turn on camera
                </button>
                <p className="max-w-xs text-xs leading-relaxed text-white/70">
                  Check your picture and sound first. This is only a preview: nothing streams until you tap Go live now.
                </p>
              </div>
            )}
            {previewOn && (
              <>
                <span className="absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                  Preview only
                </span>
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button type="button" onClick={flipPreview}
                    className="flex min-h-[44px] items-center rounded-full bg-black/50 px-4 py-2 text-xs font-bold text-white backdrop-blur transition-transform active:scale-[0.98]">
                    Flip
                  </button>
                  <button type="button" onClick={stopPreview}
                    className="flex min-h-[44px] items-center rounded-full bg-black/50 px-4 py-2 text-xs font-bold text-white backdrop-blur transition-transform active:scale-[0.98]">
                    Turn off
                  </button>
                </div>
              </>
            )}
          </div>
          {previewError && (
            <div className="mt-3 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{previewError}</p>
            </div>
          )}
          {micWarning && previewOn && (
            <div className="mt-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <MicOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
              <p className="text-sm text-amber-800">{micWarning}</p>
            </div>
          )}

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
              {phase === 'publishing' ? 'Going live...' : 'Go live now'}
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
              {previewOn
                ? 'Your camera is already on from the preview, so going live starts right away.'
                : 'Your browser will ask for camera and microphone permission when you go live. Turn on the preview above to grant it now and check your picture first.'}
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
      {/* Microphone blocked notice: live on camera, no sound */}
      {micBlocked && (
        <div className="absolute left-4 top-[6.75rem] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full bg-red-600/90 py-1.5 pl-3 pr-1.5 text-xs font-medium text-white backdrop-blur">
          <MicOff className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Microphone blocked: viewers cannot hear you</span>
          <button
            onClick={retryMic}
            className="flex-shrink-0 rounded-full bg-white px-2.5 py-1 font-bold text-red-700"
          >
            Try mic
          </button>
        </div>
      )}
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
