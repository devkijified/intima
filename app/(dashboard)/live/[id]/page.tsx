'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RequestConnectionModal } from '@/components/connections/RequestConnectionModal'
import { GiftLeaderboard } from '@/components/live/GiftLeaderboard'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Room, RoomEvent, Track, RemoteTrack, RemoteParticipant } from 'livekit-client'
import { createClient } from '@/lib/supabase/client'
import { Eye, Gift, Heart, Lock, Radio, Send, Share2, X,
  PictureInPicture2,} from '@/lib/icons'
import { formatCompactCount } from '@/lib/utils/helpers'

/* ---------------------------------- types --------------------------------- */

interface Stream {
  id: string
  provider_id: string
  title: string
  price_ngn: number
  status: string
  provider: { display_name: string; avatar_url: string | null } | null
}

interface GiftItem {
  id: string
  name: string
  emoji: string
  coin_cost: number
  tier: 'basic' | 'premium' | 'luxury' | 'mega'
}

interface ChatMsg {
  id: string
  name: string
  body: string
  mine: boolean
  senderId?: string
}

interface FloatingHeart {
  id: number
  x: number
}

interface GiftEvent {
  id: string
  emoji: string
  name: string
  senderName: string
  tier: GiftItem['tier']
}

const CHAT_TOPIC = 'chat'
const CHAT_MAX = 60

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/* --------------------------------- component ------------------------------- */

export default function StreamRoomPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const id = params.id as string

  const [phase, setPhase] = useState<'loading' | 'live' | 'ended' | 'unauthorized' | 'paid'>('loading')
  const [stream, setStream] = useState<Stream | null>(null)
  const [paidPrice, setPaidPrice] = useState(0)
  const [showConnectModal, setShowConnectModal] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const [pipActive, setPipActive] = useState(false)
  const [pipSupported] = useState(
    () => typeof document !== 'undefined' && 'pictureInPictureEnabled' in document
  )
  const roomRef = useRef<Room | null>(null)
  const lastTapRef = useRef(0)
  const heartIdRef = useRef(0)

  const [viewerCount, setViewerCount] = useState(1)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')
  const [likes, setLikes] = useState(0)
  const [hearts, setHearts] = useState<FloatingHeart[]>([])
  const [myName, setMyName] = useState('Guest')

  const [giftOpen, setGiftOpen] = useState(false)
  const [catalog, setCatalog] = useState<GiftItem[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [sendingGift, setSendingGift] = useState<string | null>(null)
  const [needTopup, setNeedTopup] = useState(false)

  const [megaGift, setMegaGift] = useState<GiftEvent | null>(null)
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set())
  const blockedRef = useRef<Set<string>>(new Set())
  const [modTarget, setModTarget] = useState<ChatMsg | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  const [hostId, setHostId] = useState<string | null>(null)
  const [miniGifts, setMiniGifts] = useState<GiftEvent[]>([])

  /* ------------------------------ helpers --------------------------------- */

  const pushMessage = useCallback((m: ChatMsg) => {
    setMessages((prev) => [...prev.slice(-CHAT_MAX + 1), m])
  }, [])

  const spawnHearts = useCallback((n: number) => {
    const fresh: FloatingHeart[] = Array.from({ length: n }, () => ({
      id: ++heartIdRef.current,
      x: 8 + Math.random() * 72,
    }))
    setHearts((prev) => [...prev.slice(-24), ...fresh])
    setLikes((l) => l + n)
    window.setTimeout(() => {
      setHearts((prev) => prev.filter((h) => !fresh.some((f) => f.id === h.id)))
    }, 1400)
  }, [])

  /* ------------------------------ connect --------------------------------- */

  useEffect(() => {
    let cancelled = false

    async function boot() {
      // 1. Load stream + session user.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setMyId(user.id)
      setMyName(
        (user.user_metadata?.display_name as string | undefined) ??
          user.email?.split('@')[0] ??
          'Guest'
      )

      const { data: session } = await supabase
        .from('live_sessions')
        .select('id, provider_id, title, price_ngn, status')
        .eq('id', id)
        .maybeSingle()
      if (cancelled) return

      if (!session || session.status !== 'live') {
        setPhase('ended')
        return
      }
      setHostId(session.provider_id)

      const { data: mods } = await supabase
        .from('stream_moderation')
        .select('user_id')
        .eq('session_id', id)
      if (mods && mods.length > 0) {
        const set = new Set<string>(mods.map((r: any) => r.user_id))
        blockedRef.current = set
        setBlockedIds(set)
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', session.provider_id)
        .maybeSingle()
      if (cancelled) return
      setStream({ ...session, provider: prof })

      // 2. Mint the viewer token.
      let tokenRes: Response
      try {
        tokenRes = await fetch('/api/live/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: id, role: 'viewer' }),
        })
      } catch {
        if (!cancelled) setPhase('ended')
        return
      }
      if (cancelled) return

      if (tokenRes.status === 401) {
        router.replace('/login')
        return
      }
      if (tokenRes.status === 404) {
        setPhase('ended')
        return
      }
      if (tokenRes.status === 402) {
        setPaidPrice(session.price_ngn ?? 0)
        setPhase('paid')
        return
      }
      if (!tokenRes.ok) {
        setPhase('ended')
        return
      }
      const { token, url } = (await tokenRes.json()) as { token: string; url: string; room: string }

      // 3. Connect to the LiveKit room.
      const room = new Room({ adaptiveStream: true, dynacast: true })
      roomRef.current = room

      const updateViewers = () => {
        // Host + every remote participant currently in the room.
        setViewerCount(room.remoteParticipants.size + 1)
      }

      const attachHostVideo = (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Video && videoRef.current) {
          track.attach(videoRef.current)
        }
      }

      room.on(RoomEvent.TrackSubscribed, attachHostVideo)
      room.on(RoomEvent.ParticipantConnected, updateViewers)
      room.on(RoomEvent.ParticipantDisconnected, updateViewers)
      room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
        try {
          const parsed = JSON.parse(new TextDecoder().decode(payload)) as {
            topic?: string
            name?: string
            body?: string
          }
          if (parsed.topic === CHAT_TOPIC && parsed.body) {
            const sid = participant?.identity
            if (sid && blockedRef.current.has(sid)) return
            pushMessage({
              id: uid(),
              name: parsed.name ?? 'Guest',
              body: parsed.body.slice(0, 200),
              mine: false,
              senderId: sid,
            })
          }
        } catch {
          /* ignore malformed data packets */
        }
      })

      try {
        await room.connect(url, token)
      } catch {
        if (!cancelled) setPhase('ended')
        return
      }
      if (cancelled) {
        room.disconnect()
        return
      }

      // Attach any already-published host tracks.
      room.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((pub) => {
          if (pub.track) attachHostVideo(pub.track as RemoteTrack)
        })
      })
      updateViewers()
      setPhase('live')

      // 4. Gift catalog + coin balance (independent of the room).
      const [{ data: gifts }, { data: bal }] = await Promise.all([
        supabase
          .from('gift_catalog')
          .select('id, name, emoji, coin_cost, tier')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase.from('coin_balances').select('balance').eq('user_id', user.id).maybeSingle(),
      ])
      if (!cancelled) {
        setCatalog((gifts ?? []) as GiftItem[])
        setBalance(bal?.balance ?? 0)
      }

      // 5. Realtime gift feed for this session.
      if (cancelled) {
        room.disconnect()
        return
      }
      const channel = supabase
        .channel(`gifts-${id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'gift_transactions',
            filter: `session_id=eq.${id}`,
          },
          async (payload) => {
            const row = payload.new as {
              id: string
              gift_id: string
              sender_id: string
            }
            const gift = (gifts ?? []).find((g: GiftItem) => g.id === row.gift_id)
            if (!gift) return
            let senderName = 'Someone'
            if (row.sender_id === user.id) {
              senderName = 'You'
            } else {
              const { data: sender } = await supabase
                .from('profiles')
                .select('display_name')
                .eq('id', row.sender_id)
                .maybeSingle()
              if (sender?.display_name) senderName = sender.display_name
            }
            const evt: GiftEvent = {
              id: row.id,
              emoji: gift.emoji,
              name: gift.name,
              senderName,
              tier: gift.tier,
            }
            if (gift.tier === 'luxury' || gift.tier === 'mega') {
              setMegaGift(evt)
              window.setTimeout(() => {
                setMegaGift((cur) => (cur?.id === evt.id ? null : cur))
              }, 3000)
            } else {
              setMiniGifts((prev) => [...prev.slice(-5), evt])
              window.setTimeout(() => {
                setMiniGifts((prev) => prev.filter((g) => g.id !== evt.id))
              }, 3200)
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }

    let cleanupRealtime: (() => void) | undefined
    boot().then((c) => {
      cleanupRealtime = c
    })

    return () => {
      cancelled = true
      cleanupRealtime?.()
      roomRef.current?.disconnect()
      roomRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /* -------------------------------- actions -------------------------------- */

  const sendChat = useCallback(async () => {
    const body = draft.trim()
    const room = roomRef.current
    if (!body || !room || room.state !== 'connected') return
    const payload = new TextEncoder().encode(
      JSON.stringify({ topic: CHAT_TOPIC, name: myName, body: body.slice(0, 200) })
    )
    try {
      await room.localParticipant.publishData(payload, { reliable: true })
      pushMessage({ id: uid(), name: myName, body: body.slice(0, 200), mine: true })
      setDraft('')
    } catch {
      /* offline or kicked; ignore */
    }
  }, [draft, myName, pushMessage])

  const handleVideoTap = useCallback(() => {
    const now = Date.now()
    if (now - lastTapRef.current < 320) {
      spawnHearts(6)
    }
    lastTapRef.current = now
  }, [spawnHearts])

  const sendGift = useCallback(
    async (gift: GiftItem) => {
      if (sendingGift) return
      setSendingGift(gift.id)
      setNeedTopup(false)
      try {
        const res = await fetch('/api/live/gift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: id, giftId: gift.id }),
        })
        if (res.status === 402) {
          setNeedTopup(true)
          return
        }
        if (!res.ok) return
        setBalance((b) => (b === null ? b : Math.max(0, b - gift.coin_cost)))
        // The realtime feed echoes our own gift back as the animation.
      } finally {
        setSendingGift(null)
      }
    },
    [id, sendingGift]
  )

  const share = useCallback(async () => {
    const shareUrl = window.location.href
    const text = stream ? `${stream.provider?.display_name} is live on Intima` : 'Live on Intima'
    if (navigator.share) {
      try {
        await navigator.share({ title: text, url: shareUrl })
      } catch {
        /* dismissed */
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl)
      } catch {
        /* clipboard unavailable */
      }
    }
  }, [stream])

  // Picture-in-Picture: floating video when minimized, TikTok-style.
  const togglePip = async () => {
    const video = videoRef.current
    if (!video) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await video.requestPictureInPicture()
      }
    } catch {
      /* PiP rejected (e.g. no user gesture yet) */
    }
  }

  useEffect(() => {
    const onEnter = () => setPipActive(true)
    const onLeave = () => setPipActive(false)
    const video = videoRef.current
    video?.addEventListener('enterpictureinpicture', onEnter)
    video?.addEventListener('leavepictureinpicture', onLeave)
    return () => {
      video?.removeEventListener('enterpictureinpicture', onEnter)
      video?.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [])

  // Auto-PiP when the tab hides (minimize / switch apps).
  useEffect(() => {
    const onHide = async () => {
      const video = videoRef.current
      if (
        document.hidden &&
        video &&
        pipSupported &&
        !document.pictureInPictureElement &&
        video.readyState >= 2
      ) {
        try {
          await video.requestPictureInPicture()
        } catch {
          /* needs a prior tap; the PiP button covers it */
        }
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [pipSupported])


  /* --------------------------------- phases -------------------------------- */

  if (phase === 'loading') {
    return (
      <div className="flex h-[calc(100dvh-4rem)] items-center justify-center bg-charcoal">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="mt-4 text-sm text-white/60">Joining stream…</p>
        </div>
      </div>
    )
  }

  if (phase === 'unauthorized' || phase === 'ended') {
    return (
      <div className="flex h-[calc(100dvh-4rem)] items-center justify-center bg-charcoal px-6">
        <div className="text-center">
          <Radio className="mx-auto h-12 w-12 text-white/25" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-white">Stream ended</h1>
          <p className="mt-2 text-sm text-white/60">This live session has ended.</p>
          <Link
            href="/live"
            className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white"
          >
            Back to live
          </Link>
        </div>
      </div>
    )
  }

  if (phase === 'paid') {
    return (
      <>
      <div className="relative flex h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden bg-charcoal px-6">
        {stream?.provider?.avatar_url && (
          <img
            src={stream.provider.avatar_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-30 blur-sm"
            draggable={false}
          />
        )}
        <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center">
          <Lock className="mx-auto h-10 w-10 text-gold" />
          <h2 className="mt-3 font-display text-xl font-semibold text-charcoal">Paid stream</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {stream?.provider?.display_name} set a join fee for this stream.
          </p>
          <p className="mt-3 text-3xl font-bold text-charcoal">₦{paidPrice.toLocaleString()}</p>
          <button
            onClick={() => setShowConnectModal(true)}
            className="mt-4 w-full rounded-full bg-gold py-3 text-sm font-bold text-charcoal hover:bg-gold/90"
          >
            Connect to join
          </button>
          <p className="mt-2 text-xs text-neutral-400">
            Connecting unlocks chat, calls, and this stream.
          </p>
          <Link href="/live" className="mt-4 inline-block text-sm font-medium text-primary">
            Back to live
          </Link>
        </div>
      </div>
      {showConnectModal && stream?.provider && (
        <RequestConnectionModal
          providerId={stream.provider_id}
          providerName={stream.provider.display_name ?? 'Host'}
          providerAvatarUrl={stream.provider.avatar_url ?? null}
          onClose={() => setShowConnectModal(false)}
          onConnected={() => {
            setShowConnectModal(false)
            window.location.reload()
          }}
        />
      )}
    </>
    )
  }

  /* ---------------------------------- live ---------------------------------- */

  const hostName = stream?.provider?.display_name ?? 'Host'

  return (
    <div className="relative mx-auto h-[calc(100dvh-4rem)] w-full max-w-md overflow-hidden bg-black md:h-[calc(100dvh-5rem)]">
      <GiftLeaderboard sessionId={id} />
      {/* Video layer */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        onClick={handleVideoTap}
        className="absolute inset-0 h-full w-full cursor-pointer object-cover"
      />
      {/* Readability gradients */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Top-left: host chip + LIVE + viewers */}
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-full bg-black/50 py-1 pl-1 pr-3 backdrop-blur-sm">
          {stream?.provider?.avatar_url ? (
            <img
              src={stream.provider.avatar_url}
              alt={hostName}
              className="h-8 w-8 rounded-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-bold text-white">
              {hostName[0]?.toUpperCase() ?? 'H'}
            </div>
          )}
          <span className="max-w-[110px] truncate text-xs font-semibold text-white">{hostName}</span>
        </div>
        <span className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold tracking-wide text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
        </span>
        <button className="flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white backdrop-blur-sm">
          <Eye className="h-3 w-3" /> {formatCompactCount(viewerCount)}
        </button>
      </div>

      {/* Top-right: PiP + share + close */}
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {pipSupported && (
          <button
            onClick={togglePip}
            aria-label={pipActive ? 'Exit picture in picture' : 'Picture in picture'}
            className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm active:scale-95 ${
              pipActive ? 'bg-primary text-white' : 'bg-black/50 text-white'
            }`}
          >
            <PictureInPicture2 className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={share}
          aria-label="Share stream"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm active:scale-95"
        >
          <Share2 className="h-4 w-4" />
        </button>
        <Link
          href="/live"
          aria-label="Close stream"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm active:scale-95"
        >
          <X className="h-4 w-4" />
        </Link>
      </div>

      {/* Host moderation sheet */}
      {modTarget && (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/60" onClick={() => setModTarget(null)}>
          <div className="w-full rounded-t-3xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-sm font-bold text-charcoal">{modTarget.name}</p>
            <div className="mt-4 space-y-2">
              <button
                onClick={async () => {
                  if (!modTarget.senderId) return
                  const supabase = createClient()
                  await supabase.from('stream_moderation').insert({
                    session_id: id,
                    user_id: modTarget.senderId,
                    action: 'mute',
                  })
                  const set = new Set(blockedRef.current)
                  set.add(modTarget.senderId)
                  blockedRef.current = set
                  setBlockedIds(set)
                  setMessages((prev) => prev.filter((x) => x.senderId !== modTarget.senderId))
                  setModTarget(null)
                }}
                className="w-full rounded-2xl bg-cream py-3 text-sm font-semibold text-charcoal"
              >
                Mute for this stream
              </button>
              <button
                onClick={async () => {
                  if (!modTarget.senderId) return
                  const supabase = createClient()
                  await supabase.from('stream_moderation').insert({
                    session_id: id,
                    user_id: modTarget.senderId,
                    action: 'block',
                  })
                  const set = new Set(blockedRef.current)
                  set.add(modTarget.senderId)
                  blockedRef.current = set
                  setBlockedIds(set)
                  setMessages((prev) => prev.filter((x) => x.senderId !== modTarget.senderId))
                  setModTarget(null)
                }}
                className="w-full rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600"
              >
                Block from this stream
              </button>
              <button onClick={() => setModTarget(null)} className="w-full py-2 text-sm text-neutral-500">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mini gift toasts (basic / premium) */}
      <div className="pointer-events-none absolute left-3 top-20 flex flex-col gap-2">
        {miniGifts.map((g) => (
          <div
            key={g.id}
            className="gift-toast flex items-center gap-2 rounded-full bg-black/55 py-1.5 pl-2 pr-3 backdrop-blur-sm"
          >
            <span className="text-2xl">{g.emoji}</span>
            <div className="leading-tight">
              <p className="text-[11px] font-semibold text-white">{g.senderName}</p>
              <p className="text-[10px] text-white/70">sent {g.name}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mega gift takeover (luxury / mega) */}
      {megaGift && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="mega-gift text-center">
            <div className="text-8xl drop-shadow-2xl">{megaGift.emoji}</div>
            <p className="mt-3 rounded-full bg-black/60 px-5 py-2 text-sm font-bold text-gold backdrop-blur-sm">
              {megaGift.senderName} sent {megaGift.name}!
            </p>
          </div>
        </div>
      )}

      {/* Floating hearts */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {hearts.map((h) => (
          <span
            key={h.id}
            className="float-heart absolute bottom-24 text-2xl"
            style={{ left: `${h.x}%` }}
          >
            <Heart className="h-7 w-7 fill-primary text-primary drop-shadow-lg" />
          </span>
        ))}
      </div>

      {/* Comments */}
      <div className="pointer-events-none absolute bottom-24 left-3 right-20 flex max-h-56 flex-col justify-end gap-1.5 overflow-hidden">
        {messages.map((m) => (
          <div key={m.id} className="w-fit max-w-full">
            <p className="pointer-events-auto text-[13px] leading-snug text-white drop-shadow">
              <button
                disabled={!hostId || myId !== hostId || !m.senderId || m.mine}
                onClick={() => setModTarget(m)}
                className={`font-semibold ${m.mine ? 'text-gold' : 'text-white/85'} ${hostId && myId === hostId && !m.mine ? 'underline decoration-dotted' : ''}`}
              >
                {m.name}:{' '}
              </button>
              <span className="text-white/95">{m.body}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Like count */}
      {likes > 0 && (
        <div className="absolute bottom-24 right-3 flex flex-col items-center gap-1">
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            {formatCompactCount(likes)}
          </span>
        </div>
      )}

      {/* Bottom bar */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-5 pt-2">
        <div className="flex min-w-0 flex-1 items-center rounded-full bg-black/50 backdrop-blur-sm">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendChat()}
            placeholder="Say something nice…"
            maxLength={200}
            className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/50"
          />
          <button
            onClick={sendChat}
            disabled={!draft.trim()}
            aria-label="Send comment"
            className="mr-1 flex h-8 w-8 items-center justify-center rounded-full text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={() => setGiftOpen(true)}
          aria-label="Send a gift"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/40 active:scale-95"
        >
          <Gift className="h-5 w-5" />
        </button>
        <button
          onClick={() => spawnHearts(4)}
          aria-label="Like"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm active:scale-95"
        >
          <Heart className="h-5 w-5" />
        </button>
      </div>

      {/* Gift sheet */}
      {giftOpen && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setGiftOpen(false)} />
          <div className="gift-sheet relative rounded-t-3xl bg-[#141419] px-4 pb-8 pt-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-white">Send a gift</p>
              <span className="flex items-center gap-1 rounded-full bg-gold/15 px-3 py-1 text-xs font-bold text-gold">
                <span className="inline-block h-3 w-3 rounded-full bg-gold" />
                {balance === null ? '…' : balance.toLocaleString()} coins
              </span>
            </div>

            {needTopup && (
              <div className="mb-3 rounded-2xl border border-gold/40 bg-gold/10 p-3 text-center">
                <p className="text-sm font-semibold text-gold">Not enough coins</p>
                <p className="mt-0.5 text-xs text-white/60">
                  Top up your coins to keep gifting. (Top-ups coming soon.)
                </p>
              </div>
            )}

            <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto">
              {catalog.map((g) => (
                <button
                  key={g.id}
                  onClick={() => sendGift(g)}
                  disabled={sendingGift !== null}
                  className={`flex flex-col items-center rounded-2xl border p-3 transition-all active:scale-95 disabled:opacity-50 ${
                    g.tier === 'mega'
                      ? 'border-gold/60 bg-gold/10'
                      : g.tier === 'luxury'
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-white/10 bg-white/5'
                  }`}
                >
                  <span className="text-3xl">{g.emoji}</span>
                  <span className="mt-1 text-[11px] font-medium text-white">{g.name}</span>
                  <span className="text-[10px] font-bold text-gold">
                    {sendingGift === g.id ? '…' : `${g.coin_cost.toLocaleString()}`}
                  </span>
                </button>
              ))}
            </div>
            {catalog.length === 0 && (
              <p className="py-6 text-center text-sm text-white/50">Gift catalog unavailable.</p>
            )}
            <p className="mt-3 text-center text-[11px] text-white/40">
              1 coin = ₦10 · Gifts support {hostName}
            </p>
          </div>
        </div>
      )}

      {/* Local keyframe styles */}
      <style jsx>{`
        .float-heart {
          animation: floatUp 1.4s ease-out forwards;
        }
        @keyframes floatUp {
          0% {
            transform: translateY(0) scale(0.6);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          100% {
            transform: translateY(-46vh) scale(1.15) rotate(12deg);
            opacity: 0;
          }
        }
        .gift-toast {
          animation: toastIn 0.3s ease-out, toastOut 0.4s ease-in 2.8s forwards;
        }
        @keyframes toastIn {
          from {
            transform: translateX(-16px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes toastOut {
          to {
            transform: translateY(-8px);
            opacity: 0;
          }
        }
        .mega-gift {
          animation: megaPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), megaFade 0.5s ease-in 2.5s forwards;
        }
        @keyframes megaPop {
          0% {
            transform: scale(0.4);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes megaFade {
          to {
            opacity: 0;
            transform: scale(1.1);
          }
        }
        .gift-sheet {
          animation: sheetUp 0.28s ease-out;
        }
        @keyframes sheetUp {
          from {
            transform: translateY(60%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
