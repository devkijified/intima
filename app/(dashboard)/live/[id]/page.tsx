'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RequestConnectionModal } from '@/components/connections/RequestConnectionModal'
import { GiftLeaderboard } from '@/components/live/GiftLeaderboard'
import { useDock } from '@/components/dock/FloatingDock'
import { FanBadge } from '@/components/social/FanBadge'
import { GiftGlyph } from '@/components/live/GiftGlyph'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Room, RoomEvent, Track, RemoteTrack, RemoteParticipant, createLocalVideoTrack, createLocalAudioTrack } from 'livekit-client'
import { createClient } from '@/lib/supabase/client'
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck'
import { Crown, Eye, Gift, Heart, Lock, Radio, Send, Settings, Share2, X,
  PictureInPicture2,} from '@/lib/icons'
import { formatCompactCount } from '@/lib/utils/helpers'

/* ---------------------------------- types --------------------------------- */

interface Stream {
  id: string
  provider_id: string
  title: string
  price_ngn: number
  status: string
  pinned_text: string | null
  slow_mode_seconds: number
  blocked_words: string[]
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
  level?: number
}

interface PkBattleState {
  id: string
  status: string
  endsAt: string
  winnerSessionId: string | null
  scores: { a: number; b: number }
  mineIsA: boolean
  opponent: { sessionId: string; hostName: string | null; title: string } | null
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
const LIKE_TOPIC = 'likes'
const CHAT_MAX = 60

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/* --------------------------------- component ------------------------------- */

export default function StreamRoomPage() {
  const params = useParams()
  const router = useRouter()
  const dock = useDock()
  const supabase = createClient()
  const id = params.id as string

  // The full room takes over from the floating dock: if this session
  // is docked, undock it (the dock's own connection closes).
  useEffect(() => {
    dock.clearLiveSession(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const [phase, setPhase] = useState<'loading' | 'live' | 'ended' | 'unauthorized' | 'paid' | 'fansonly'>('loading')
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
  const [fanIds, setFanIds] = useState<Set<string>>(new Set())
  const hostIdRef = useRef<string | null>(null)
  const [miniGifts, setMiniGifts] = useState<GiftEvent[]>([])

  // Live depth: server-gated chat, pins, moderation, PK, co-hosts.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const deletedRef = useRef<Set<string>>(new Set())
  const [pinnedText, setPinnedText] = useState<string | null>(null)
  const [isModerator, setIsModerator] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pinDraft, setPinDraft] = useState('')
  const [pinEditing, setPinEditing] = useState(false)
  const [slowSel, setSlowSel] = useState(0)
  const [blockedDraft, setBlockedDraft] = useState('')
  const [modUsername, setModUsername] = useState('')
  const [cohostUsername, setCohostUsername] = useState('')
  const [panelMsg, setPanelMsg] = useState('')
  const [pkBattle, setPkBattle] = useState<PkBattleState | null>(null)
  const [pkOptions, setPkOptions] = useState<{ id: string; label: string }[]>([])
  const [pkOpponent, setPkOpponent] = useState('')
  const [railStreams, setRailStreams] = useState<
    { id: string; title: string; name: string; avatar: string | null }[]
  >([])
  const railChatRef = useRef<HTMLDivElement>(null)
  const railStickRef = useRef(true)
  const [, setPkTick] = useState(0)
  const [cohostInvite, setCohostInvite] = useState<'invited' | 'accepted' | null>(null)
  const [cohostBusy, setCohostBusy] = useState(false)
  const tilesRef = useRef<HTMLDivElement>(null)
  const tileElsRef = useRef(new Map<string, HTMLVideoElement>())

  /* ------------------------------ helpers --------------------------------- */

  const pushMessage = useCallback((m: ChatMsg) => {
    setMessages((prev) => [...prev.slice(-CHAT_MAX + 1), m])
  }, [])

  // Video routing for multiple publishers: the host track fills the
  // main stage; every other publisher (an accepted co-host) gets a
  // small tile in the tile strip.
  const attachRemoteVideo = useCallback((track: RemoteTrack, identity?: string) => {
    if (track.kind !== Track.Kind.Video) return
    if (!identity || identity === hostIdRef.current) {
      if (videoRef.current) track.attach(videoRef.current)
      return
    }
    const container = tilesRef.current
    if (!container) return
    let el = tileElsRef.current.get(identity)
    if (!el) {
      el = document.createElement('video')
      el.autoplay = true
      el.playsInline = true
      el.className = 'h-24 w-[4.5rem] rounded-xl border border-white/40 bg-black object-cover'
      container.appendChild(el)
      tileElsRef.current.set(identity, el)
    }
    track.attach(el)
  }, [])

  const detachTile = useCallback((identity: string) => {
    const el = tileElsRef.current.get(identity)
    if (el) {
      el.remove()
      tileElsRef.current.delete(identity)
    }
  }, [])

  // Shared chat packet handler for the viewer connection and for a
  // co-host publisher connection. Message ids travel in the packet so
  // server-recorded deletions can match them on every client.
  const handleDataPacket = useCallback(
    (payload: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(payload)) as {
          topic?: string
          name?: string
          body?: string
          id?: string
          level?: number
          n?: number
        }
        if (parsed.topic === LIKE_TOPIC) {
          const n = Math.min(Math.max(Math.floor(parsed.n ?? 1), 1), 20)
          setLikes((l) => l + n)
          addHearts(1)
          return
        }
        if (parsed.topic === CHAT_TOPIC && parsed.body) {
          const sid = participant?.identity
          if (sid && blockedRef.current.has(sid)) return
          const mid = parsed.id ?? uid()
          if (deletedRef.current.has(mid)) return
          pushMessage({
            id: mid,
            name: parsed.name ?? 'Guest',
            body: parsed.body.slice(0, 200),
            mine: false,
            senderId: sid,
            level: typeof parsed.level === 'number' ? parsed.level : undefined,
          })
        }
      } catch {
        /* ignore malformed data packets */
      }
    },
    [pushMessage]
  )

  const addHearts = useCallback((n: number) => {
    const fresh: FloatingHeart[] = Array.from({ length: n }, () => ({
      id: ++heartIdRef.current,
      x: 8 + Math.random() * 72,
    }))
    setHearts((prev) => [...prev.slice(-24), ...fresh])
    window.setTimeout(() => {
      setHearts((prev) => prev.filter((h) => !fresh.some((f) => f.id === h.id)))
    }, 1400)
  }, [])

  const spawnHearts = useCallback(
    (n: number) => {
      addHearts(n)
      setLikes((l) => l + n)
    },
    [addHearts]
  )

  // Likes are shared with the whole room: own taps count locally at
  // once and are broadcast in small batches on the data channel, so
  // every viewer and the host watch the same running total climb.
  const likePendingRef = useRef(0)
  const likeTimerRef = useRef<number | null>(null)
  const flushLikes = useCallback(() => {
    likeTimerRef.current = null
    const n = likePendingRef.current
    likePendingRef.current = 0
    if (n <= 0) return
    const room = roomRef.current
    if (!room) return
    const payload = new TextEncoder().encode(JSON.stringify({ topic: LIKE_TOPIC, n }))
    void (async () => {
      try {
        await room.localParticipant.publishData(payload, { reliable: false })
      } catch {
        /* a lost like batch is not worth an error */
      }
    })()
  }, [])
  const tapLike = useCallback(
    (n: number) => {
      spawnHearts(n)
      likePendingRef.current += n
      if (likeTimerRef.current === null) {
        likeTimerRef.current = window.setTimeout(flushLikes, 900)
      }
    },
    [spawnHearts, flushLikes]
  )

  // Discovery rail (desktop): other rooms live right now, refreshed
  // every 30 seconds so the rail never points at a dead stream.
  useEffect(() => {
    let live = true
    const load = async () => {
      const { data } = await supabase
        .from('live_sessions')
        .select('id, title, provider_id')
        .eq('status', 'live')
        .neq('id', id)
        .order('created_at', { ascending: false })
        .limit(12)
      if (!live || !data) return
      const rows = data as { id: string; title: string; provider_id: string }[]
      const names = new Map<string, { name: string; avatar: string | null }>()
      if (rows.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', rows.map((r) => r.provider_id))
        ;(profs ?? []).forEach((p: { id: string; display_name: string | null; avatar_url: string | null }) =>
          names.set(p.id, { name: p.display_name ?? 'Companion', avatar: p.avatar_url ?? null })
        )
      }
      if (live) {
        setRailStreams(
          rows.map((r) => ({
            id: r.id,
            title: r.title,
            name: names.get(r.provider_id)?.name ?? 'Companion',
            avatar: names.get(r.provider_id)?.avatar ?? null,
          }))
        )
      }
    }
    load()
    const t = window.setInterval(load, 30000)
    return () => {
      live = false
      window.clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Rail chat follows new comments while the reader is near the
  // bottom, and stays put when they have scrolled up to read.
  useEffect(() => {
    const el = railChatRef.current
    if (el && railStickRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

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
        .select('id, provider_id, title, price_ngn, status, pinned_text, slow_mode_seconds, blocked_words')
        .eq('id', id)
        .maybeSingle()
      if (cancelled) return

      if (!session || session.status !== 'live') {
        setPhase('ended')
        return
      }
      setHostId(session.provider_id)
      hostIdRef.current = session.provider_id
      setPinnedText(session.pinned_text ?? null)
      setPinDraft(session.pinned_text ?? '')
      setSlowSel(session.slow_mode_seconds ?? 0)
      setBlockedDraft((session.blocked_words ?? []).join(', '))

      const { data: mods } = await supabase
        .from('stream_moderation')
        .select('user_id')
        .eq('session_id', id)
      if (mods && mods.length > 0) {
        const set = new Set<string>(mods.map((r: any) => r.user_id))
        blockedRef.current = set
        setBlockedIds(set)
      }

      // Am I an appointed moderator or an invited co-host here?
      const [{ data: myMod }, { data: myCohost }] = await Promise.all([
        supabase
          .from('stream_moderators')
          .select('id')
          .eq('session_id', id)
          .eq('moderator_id', user.id)
          .maybeSingle(),
        supabase
          .from('live_cohosts')
          .select('status')
          .eq('session_id', id)
          .eq('cohost_id', user.id)
          .maybeSingle(),
      ])
      if (!cancelled) {
        if (myMod) setIsModerator(true)
        if (myCohost?.status === 'invited') setCohostInvite('invited')
        else if (myCohost?.status === 'accepted') setCohostInvite('accepted')
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
      if (tokenRes.status === 403) {
        const j = await tokenRes.json().catch(() => ({}))
        if (j.error === 'fans_only') {
          setPhase('fansonly')
          return
        }
        setPhase('ended')
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

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: unknown, participant: RemoteParticipant) => {
        attachRemoteVideo(track, participant?.identity)
      })
      room.on(RoomEvent.TrackUnsubscribed, (_track: RemoteTrack, _pub: unknown, participant: RemoteParticipant) => {
        if (participant && participant.identity !== session.provider_id) {
          detachTile(participant.identity)
        }
      })
      room.on(RoomEvent.ParticipantConnected, updateViewers)
      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        updateViewers()
        if (participant && participant.identity !== session.provider_id) {
          detachTile(participant.identity)
        }
      })
      room.on(RoomEvent.DataReceived, handleDataPacket)

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

      // Attach any already-published tracks (host stage, co-host tiles).
      room.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((pub) => {
          if (pub.track) attachRemoteVideo(pub.track as RemoteTrack, p.identity)
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

      // 6. Realtime chat deletions + live session settings (pin, slow
      // mode). Deletions are recorded server-side by /api/live/moderate
      // because data packets cannot be recalled.
      const delChannel = supabase
        .channel(`chat-depth-${id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'live_chat_deletions', filter: `session_id=eq.${id}` },
          (payload) => {
            const mid = (payload.new as { message_id?: string }).message_id
            if (!mid) return
            const next = new Set(deletedRef.current)
            next.add(mid)
            deletedRef.current = next
            setDeletedIds(next)
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'live_sessions', filter: `id=eq.${id}` },
          (payload) => {
            const row = payload.new as {
              pinned_text?: string | null
              slow_mode_seconds?: number
              blocked_words?: string[]
            }
            if ('pinned_text' in row) setPinnedText(row.pinned_text ?? null)
            if (typeof row.slow_mode_seconds === 'number') setSlowSel(row.slow_mode_seconds)
            if (Array.isArray(row.blocked_words)) setBlockedDraft(row.blocked_words.join(', '))
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
        supabase.removeChannel(delChannel)
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

  // Fan club members of this host, fetched once when the host is
  // known. Chat sender identity is the LiveKit participant identity,
  // which is the user id (see handleDataPacket and sendChat).
  useEffect(() => {
    if (!hostId) return
    let live = true
    ;(async () => {
      try {
        const res = await fetch(
          `/api/subscriptions/subscribers?provider_id=${encodeURIComponent(hostId)}`
        )
        if (!res.ok) return
        const j = await res.json()
        if (live && Array.isArray(j.subscriberIds)) {
          setFanIds(new Set(j.subscriberIds as string[]))
        }
      } catch {
        /* badges are best effort */
      }
    })()
    return () => {
      live = false
    }
  }, [hostId])

  /* -------------------------------- actions -------------------------------- */

  const [chatBlocked, setChatBlocked] = useState('')
  const showChatError = useCallback((msg: string) => {
    setChatBlocked(msg)
    window.setTimeout(() => setChatBlocked(''), 5000)
  }, [])
  const sendChat = useCallback(async () => {
    const body = draft.trim()
    const room = roomRef.current
    if (!body || !room || room.state !== 'connected') return
    // Fence, first pass on the client: stream chat is public to every
    // viewer, so contact details are blocked here (private contact goes
    // to paid connections only).
    const scan = scanForLeaks(body)
    if (!scan.clean) {
      showChatError(`${leakWarning(scan.leaks)} Contact details stay in paid connections.`)
      return
    }
    // Gate check, then publish: chat is client-to-client data packets,
    // so the server cannot intercept a send. The app must pass
    // POST /api/live/chat/check first; the gate applies the same leak
    // scan server-side plus blocked words, mute state, and slow mode,
    // and records the send in live_chat_log.
    const messageId = uid()
    try {
      const gate = await fetch('/api/live/chat/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id, body: body.slice(0, 200), messageId }),
      })
      if (!gate.ok) {
        const j = await gate.json().catch(() => ({}))
        showChatError(j.error || 'Message could not be sent')
        return
      }
    } catch {
      showChatError('Message could not be verified. Check your connection and try again.')
      return
    }
    setChatBlocked('')
    const payload = new TextEncoder().encode(
      JSON.stringify({ topic: CHAT_TOPIC, id: messageId, name: myName, body: body.slice(0, 200) })
    )
    try {
      await room.localParticipant.publishData(payload, { reliable: true })
      pushMessage({ id: messageId, name: myName, body: body.slice(0, 200), mine: true, senderId: myId ?? undefined })
      setDraft('')
    } catch {
      /* offline or kicked; ignore */
    }
  }, [draft, myName, myId, id, pushMessage, showChatError])

  /* ------------------------- live depth actions -------------------------- */

  const callModerate = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/live/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id, ...payload }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Action failed')
      return j
    },
    [id]
  )

  const fetchPk = useCallback(async () => {
    try {
      const res = await fetch(`/api/live/pk?sessionId=${id}`)
      if (!res.ok) return
      const j = await res.json()
      setPkBattle((j.battle as PkBattleState | null) ?? null)
    } catch {
      /* polling is best effort */
    }
  }, [id])

  useEffect(() => {
    if (phase !== 'live') return
    fetchPk()
    const t = window.setInterval(fetchPk, 5000)
    return () => window.clearInterval(t)
  }, [phase, fetchPk])

  // One second ticker so the PK countdown moves between polls.
  useEffect(() => {
    if (!pkBattle || pkBattle.status !== 'active') return
    const t = window.setInterval(() => setPkTick((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [pkBattle])

  // Load PK opponent options when the host opens the control panel.
  useEffect(() => {
    if (!panelOpen || !myId || myId !== hostId) return
    let live = true
    ;(async () => {
      const { data } = await supabase
        .from('live_sessions')
        .select('id, title, provider_id')
        .eq('status', 'live')
        .neq('id', id)
      if (!live || !data) return
      const rows = data as { id: string; title: string; provider_id: string }[]
      const names = new Map<string, string>()
      if (rows.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', rows.map((r) => r.provider_id))
        ;(profs ?? []).forEach((p: { id: string; display_name: string | null }) =>
          names.set(p.id, p.display_name ?? 'Companion')
        )
      }
      if (!live) return
      setPkOptions(
        rows.map((r) => ({ id: r.id, label: `${names.get(r.provider_id) ?? 'Companion'}: ${r.title}` }))
      )
    })()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, myId, hostId, id])

  // Co-host accept: respond, then reconnect with a publisher token and
  // publish camera and mic into the same room.
  const acceptCohost = useCallback(async () => {
    if (cohostBusy) return
    setCohostBusy(true)
    try {
      const res = await fetch('/api/live/cohost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'respond', sessionId: id, accept: true }),
      })
      if (!res.ok) throw new Error('respond failed')
      setCohostInvite('accepted')

      const tokRes = await fetch('/api/live/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id, role: 'publisher' }),
      })
      if (!tokRes.ok) throw new Error('token failed')
      const { token, url } = (await tokRes.json()) as { token: string; url: string }

      roomRef.current?.disconnect()
      tileElsRef.current.forEach((el) => el.remove())
      tileElsRef.current.clear()

      const room = new Room({ adaptiveStream: true, dynacast: true })
      roomRef.current = room
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: unknown, participant: RemoteParticipant) => {
        attachRemoteVideo(track, participant?.identity)
      })
      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        setViewerCount(room.remoteParticipants.size + 1)
        if (participant && participant.identity !== hostIdRef.current) detachTile(participant.identity)
      })
      room.on(RoomEvent.ParticipantConnected, () => setViewerCount(room.remoteParticipants.size + 1))
      room.on(RoomEvent.DataReceived, handleDataPacket)
      await room.connect(url, token)
      room.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((pub) => {
          if (pub.track) attachRemoteVideo(pub.track as RemoteTrack, p.identity)
        })
      })
      setViewerCount(room.remoteParticipants.size + 1)

      const cam = await createLocalVideoTrack({ facingMode: 'user' })
      const mic = await createLocalAudioTrack()
      await room.localParticipant.publishTrack(cam)
      await room.localParticipant.publishTrack(mic)
      // Own preview tile so the co-host can see themselves.
      const container = tilesRef.current
      if (container) {
        const el = document.createElement('video')
        el.autoplay = true
        el.playsInline = true
        el.muted = true
        el.className = 'h-24 w-[4.5rem] rounded-xl border-2 border-gold bg-black object-cover'
        container.appendChild(el)
        tileElsRef.current.set('__self__', el)
        cam.attach(el)
      }
    } catch {
      showChatError('Co-host connect failed. You are still watching as a viewer.')
    } finally {
      setCohostBusy(false)
    }
  }, [id, cohostBusy, attachRemoteVideo, detachTile, handleDataPacket, showChatError])

  const declineCohost = useCallback(async () => {
    try {
      await fetch('/api/live/cohost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'respond', sessionId: id, accept: false }),
      })
    } catch {
      /* best effort */
    }
    setCohostInvite(null)
  }, [id])

  const handleVideoTap = useCallback(() => {
    const now = Date.now()
    if (now - lastTapRef.current < 320) {
      tapLike(6)
    }
    lastTapRef.current = now
  }, [tapLike])

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

  if (phase === 'fansonly') {
    return (
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
          <Crown className="mx-auto h-10 w-10 text-gold" />
          <h2 className="mt-3 font-display text-xl font-semibold text-charcoal">Fans only</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {stream?.provider?.display_name ?? 'This companion'} is holding this show for her fan club members.
          </p>
          <p className="mt-2 text-sm text-neutral-500">
            Join her fan club and you are in, for this show and every Premium show she runs.
          </p>
          {stream?.provider_id && (
            <Link
              href={`/companion/${stream.provider_id}`}
              className="mt-4 block w-full rounded-full bg-gold py-3 text-sm font-bold text-charcoal hover:bg-gold/90"
            >
              Join her fan club
            </Link>
          )}
          <Link href="/live" className="mt-4 inline-block text-sm font-medium text-primary">
            Back to live
          </Link>
        </div>
      </div>
    )
  }

  /* ---------------------------------- live ---------------------------------- */

  const hostName = stream?.provider?.display_name ?? 'Host'
  const isHostMe = !!myId && !!hostId && myId === hostId
  const canModerate = isHostMe || isModerator
  const visibleMessages = messages.filter((m) => !deletedIds.has(m.id))
  const pkMine = pkBattle ? (pkBattle.mineIsA ? pkBattle.scores.a : pkBattle.scores.b) : 0
  const pkTheirs = pkBattle ? (pkBattle.mineIsA ? pkBattle.scores.b : pkBattle.scores.a) : 0
  const pkSecondsLeft = pkBattle
    ? Math.max(0, Math.round((new Date(pkBattle.endsAt).getTime() - Date.now()) / 1000))
    : 0
  const pkTimeLeft = `${Math.floor(pkSecondsLeft / 60)}:${String(pkSecondsLeft % 60).padStart(2, '0')}`
  const pkIWon = !!pkBattle && pkBattle.winnerSessionId === id
  const pkTheyWon =
    !!pkBattle && !!pkBattle.opponent && pkBattle.winnerSessionId === pkBattle.opponent.sessionId

  return (
    <div className="relative mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-md bg-black md:h-[calc(100dvh-5rem)] lg:max-w-none">
      {/* Discovery rail: other rooms live now (desktop theatre) */}
      <aside className="hidden w-[264px] shrink-0 flex-col border-r border-white/10 bg-[#0B0B0F] lg:flex">
        <p className="px-4 pb-2 pt-4 text-[11px] font-bold uppercase tracking-widest text-white/50">
          Live now
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {railStreams.length === 0 && (
            <p className="px-2 py-3 text-xs text-white/40">No other streams are live right now.</p>
          )}
          {railStreams.map((s) => (
            <Link
              key={s.id}
              href={`/live/${s.id}`}
              className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-white/5"
            >
              {s.avatar ? (
                <img src={s.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" draggable={false} />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                  {s.name[0]?.toUpperCase() ?? 'L'}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{s.name}</span>
                <span className="block truncate text-xs text-white/50">{s.title}</span>
              </span>
              <span className="shrink-0 rounded-md bg-red-600 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
                LIVE
              </span>
            </Link>
          ))}
        </div>
      </aside>

      {/* Centre column: the stage, with the gift bar under it */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-w-0 flex-1 overflow-hidden">
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
      <div className="absolute left-3 top-3 flex items-center gap-2 lg:hidden">
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

      {/* PK score bar + pinned message, stacked under the top bar */}
      {(pkBattle || pinnedText) && (
        <div className="absolute inset-x-3 top-14 z-10 flex flex-col items-start gap-1.5">
          {pkBattle && pkBattle.status === 'active' && (
            <div className="flex w-full items-center justify-between gap-2 rounded-2xl bg-black/60 px-3 py-2 backdrop-blur-sm">
              <span className="text-xs font-bold text-white">
                PK · You <span className="text-gold">{pkMine.toLocaleString()}</span>
              </span>
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                {pkTimeLeft}
              </span>
              {pkBattle.opponent ? (
                <Link href={`/live/${pkBattle.opponent.sessionId}`} className="truncate text-xs font-bold text-white">
                  <span className="text-gold">{pkTheirs.toLocaleString()}</span>{' '}
                  {pkBattle.opponent.hostName ?? 'Opponent'}
                </Link>
              ) : (
                <span className="text-xs font-bold text-white">{pkTheirs.toLocaleString()}</span>
              )}
            </div>
          )}
          {pkBattle && pkBattle.status === 'finished' && (
            <div className="w-full rounded-2xl bg-gold px-3 py-2 text-center text-xs font-bold text-charcoal">
              {pkIWon
                ? 'You won the PK battle!'
                : pkTheyWon
                  ? `${pkBattle.opponent?.hostName ?? 'Your opponent'} won the PK battle`
                  : 'The PK battle ended in a tie'}
            </div>
          )}
          {pinnedText && (
            <p className="max-w-full truncate rounded-full bg-gold/90 px-3 py-1.5 text-xs font-semibold text-charcoal">
              Pinned: {pinnedText}
            </p>
          )}
        </div>
      )}

      {/* Co-host tiles: extra publishers render here, host stays on stage */}
      <div ref={tilesRef} className="absolute right-3 top-24 z-10 flex flex-col gap-2" />

      {/* Top-right: PiP + share + close */}
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {canModerate && (
          <button
            onClick={() => setPanelOpen(true)}
            aria-label="Stream controls"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm active:scale-95"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
        {!isHostMe && (
          <button
            onClick={() => {
              dock.showLive({
                sessionId: id,
                title: stream?.title ?? 'Live stream',
                hostName,
              })
              router.push('/live')
            }}
            aria-label="Minimize player"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm active:scale-95"
          >
            <PictureInPicture2 className="h-4 w-4" />
          </button>
        )}
        {isHostMe && pipSupported && (
          <button
            onClick={togglePip}
            aria-label={pipActive ? 'Exit picture in picture' : 'Picture in picture'}
            className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm active:scale-95 ${
              pipActive ? 'bg-primary text-white' : 'bg-black/50 text-white'
            }`}
          >
            <PictureInPicture2 className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={share}
          aria-label="Share stream"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm active:scale-95"
        >
          <Share2 className="h-4 w-4" />
        </button>
        <Link
          href="/live"
          aria-label="Close stream"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm active:scale-95"
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
                  // Deletion is recorded server-side; subscribed clients
                  // hide this message id. Hide locally right away too.
                  try {
                    await callModerate({ action: 'delete_message', messageId: modTarget.id })
                  } catch {
                    /* local hide still applies */
                  }
                  const next = new Set(deletedRef.current)
                  next.add(modTarget.id)
                  deletedRef.current = next
                  setDeletedIds(next)
                  setModTarget(null)
                }}
                className="w-full rounded-2xl bg-cream py-3 text-sm font-semibold text-charcoal"
              >
                Delete this message
              </button>
              {modTarget.senderId && (
                <button
                  onClick={async () => {
                    if (!modTarget.senderId) return
                    try {
                      await callModerate({ action: 'mute_viewer', targetUserId: modTarget.senderId })
                    } catch {
                      /* fall through to the local hide */
                    }
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
              )}
              {isHostMe && modTarget.senderId && (
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
              )}
              <button onClick={() => setModTarget(null)} className="w-full py-2 text-sm text-neutral-500">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Host and moderator control panel */}
      {panelOpen && canModerate && (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/60" onClick={() => setPanelOpen(false)}>
          <div
            className="max-h-[85%] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-charcoal">Stream controls</p>
              <button onClick={() => setPanelOpen(false)} aria-label="Close controls" className="text-neutral-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            {!isHostMe && (
              <p className="mt-2 text-xs text-neutral-500">
                You are a moderator here. Tap a name in chat to delete a message or mute its author.
              </p>
            )}
            {isHostMe && (
              <div className="mt-4 space-y-5">
                {/* Pin */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Pinned message</p>
                  {pinEditing ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={pinDraft}
                        onChange={(e) => setPinDraft(e.target.value)}
                        maxLength={200}
                        placeholder="Pin a message for viewers"
                        className="min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <button
                        onClick={async () => {
                          try {
                            await callModerate({ action: 'set_pin', pinnedText: pinDraft })
                            setPinnedText(pinDraft.trim() || null)
                            setPinEditing(false)
                            setPanelMsg('Pin updated.')
                          } catch (e) {
                            setPanelMsg(e instanceof Error ? e.message : 'Could not set pin')
                          }
                        }}
                        className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm text-charcoal">
                        {pinnedText || 'No pin yet'}
                      </p>
                      <button
                        onClick={() => {
                          setPinDraft(pinnedText ?? '')
                          setPinEditing(true)
                        }}
                        className="shrink-0 rounded-xl bg-cream px-3 py-2 text-xs font-semibold text-charcoal"
                      >
                        {pinnedText ? 'Edit pin' : 'Add pin'}
                      </button>
                      {pinnedText && (
                        <button
                          onClick={async () => {
                            try {
                              await callModerate({ action: 'set_pin', pinnedText: '' })
                              setPinnedText(null)
                              setPinDraft('')
                              setPanelMsg('Pin cleared.')
                            } catch (e) {
                              setPanelMsg(e instanceof Error ? e.message : 'Could not clear pin')
                            }
                          }}
                          className="shrink-0 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Slow mode */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Slow mode</p>
                  <select
                    value={slowSel}
                    onChange={async (e) => {
                      const v = Number(e.target.value)
                      setSlowSel(v)
                      try {
                        await callModerate({ action: 'set_slow', slowModeSeconds: v })
                        setPanelMsg(v === 0 ? 'Slow mode off.' : `Slow mode set to ${v}s.`)
                      } catch (err) {
                        setPanelMsg(err instanceof Error ? err.message : 'Could not set slow mode')
                      }
                    }}
                    className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value={0}>Off</option>
                    <option value={5}>5 seconds between messages</option>
                    <option value={10}>10 seconds between messages</option>
                    <option value={30}>30 seconds between messages</option>
                  </select>
                </div>

                {/* Blocked words */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Blocked words</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={blockedDraft}
                      onChange={(e) => setBlockedDraft(e.target.value)}
                      placeholder="Comma separated words"
                      className="min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <button
                      onClick={async () => {
                        try {
                          await callModerate({
                            action: 'set_blocked_words',
                            blockedWords: blockedDraft.split(',').map((w) => w.trim()).filter(Boolean),
                          })
                          setPanelMsg('Blocked words saved.')
                        } catch (e) {
                          setPanelMsg(e instanceof Error ? e.message : 'Could not save words')
                        }
                      }}
                      className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white"
                    >
                      Save
                    </button>
                  </div>
                </div>

                {/* Moderators */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Moderators</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={modUsername}
                      onChange={(e) => setModUsername(e.target.value)}
                      placeholder="Username"
                      className="min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <button
                      onClick={async () => {
                        if (!modUsername.trim()) return
                        try {
                          await callModerate({ action: 'appoint_mod', targetUsername: modUsername.trim() })
                          setPanelMsg(`@${modUsername.trim()} is now a moderator.`)
                          setModUsername('')
                        } catch (e) {
                          setPanelMsg(e instanceof Error ? e.message : 'Could not appoint')
                        }
                      }}
                      className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white"
                    >
                      Appoint
                    </button>
                    <button
                      onClick={async () => {
                        if (!modUsername.trim()) return
                        try {
                          await callModerate({ action: 'remove_mod', targetUsername: modUsername.trim() })
                          setPanelMsg(`@${modUsername.trim()} is no longer a moderator.`)
                          setModUsername('')
                        } catch (e) {
                          setPanelMsg(e instanceof Error ? e.message : 'Could not remove')
                        }
                      }}
                      className="shrink-0 rounded-xl bg-cream px-3 py-2 text-sm font-semibold text-charcoal"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Co-host */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Co-host</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={cohostUsername}
                      onChange={(e) => setCohostUsername(e.target.value)}
                      placeholder="Username to invite"
                      className="min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <button
                      onClick={async () => {
                        if (!cohostUsername.trim()) return
                        try {
                          const res = await fetch('/api/live/cohost', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: 'invite',
                              sessionId: id,
                              username: cohostUsername.trim(),
                            }),
                          })
                          const j = await res.json().catch(() => ({}))
                          if (!res.ok) throw new Error(j.error || 'Invite failed')
                          setPanelMsg(`Co-host invite sent to @${cohostUsername.trim()}.`)
                          setCohostUsername('')
                        } catch (e) {
                          setPanelMsg(e instanceof Error ? e.message : 'Invite failed')
                        }
                      }}
                      className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white"
                    >
                      Invite
                    </button>
                  </div>
                </div>

                {/* PK battle */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">PK battle</p>
                  {pkBattle && pkBattle.status === 'active' ? (
                    <p className="mt-2 text-sm text-charcoal">
                      Battle running against {pkBattle.opponent?.hostName ?? 'your opponent'}. Ends in{' '}
                      {pkTimeLeft}.
                    </p>
                  ) : pkOptions.length === 0 ? (
                    <p className="mt-2 text-sm text-neutral-500">No other streams are live right now.</p>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <select
                        value={pkOpponent}
                        onChange={(e) => setPkOpponent(e.target.value)}
                        className="min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary"
                      >
                        <option value="">Pick an opponent stream</option>
                        {pkOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={!pkOpponent}
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/live/pk', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                sessionId: id,
                                opponentSessionId: pkOpponent,
                                durationMinutes: 10,
                              }),
                            })
                            const j = await res.json().catch(() => ({}))
                            if (!res.ok) throw new Error(j.error || 'Could not start PK')
                            setPkBattle(j.battle as PkBattleState)
                            setPanelMsg('PK battle started. Ten minutes, most gift coins wins.')
                          } catch (e) {
                            setPanelMsg(e instanceof Error ? e.message : 'Could not start PK')
                          }
                        }}
                        className="shrink-0 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                      >
                        Start PK
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            {panelMsg && <p className="mt-4 text-center text-xs font-medium text-neutral-500">{panelMsg}</p>}
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
            <GiftGlyph name={g.name} tier={g.tier} size="sm" />
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
            <div className="flex justify-center drop-shadow-2xl"><GiftGlyph name={megaGift.name} tier={megaGift.tier} size="mega" /></div>
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

      {/* Legibility scrim: comments float over the video */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />

      {/* Comments */}
      <div className="pointer-events-none absolute bottom-24 left-3 right-20 flex max-h-56 flex-col justify-end gap-1.5 overflow-hidden lg:hidden">
        {visibleMessages.map((m) => (
          <div key={m.id} className="w-fit max-w-full">
            <p className="pointer-events-auto text-[13px] leading-snug text-white drop-shadow">
              {typeof m.level === 'number' && (
                <span className="mr-1 rounded-full bg-gold px-1.5 py-px align-middle text-[9px] font-bold text-charcoal">
                  FAN {m.level}
                </span>
              )}
              {m.senderId && fanIds.has(m.senderId) && <FanBadge className="mr-1" />}
              <button
                disabled={!canModerate || m.mine}
                onClick={() => setModTarget(m)}
                className={`font-semibold ${m.mine || (m.senderId && fanIds.has(m.senderId)) ? 'text-gold' : 'text-white/85'} ${canModerate && !m.mine ? 'underline decoration-dotted' : ''}`}
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
        <div className="absolute bottom-24 right-3 flex flex-col items-center gap-1 lg:hidden">
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            {formatCompactCount(likes)}
          </span>
        </div>
      )}

      {/* Gate notice: leak scan, blocked word, mute, or slow mode */}
      {chatBlocked && (
        <div className="absolute inset-x-3 bottom-[4.5rem] z-30 animate-pop-in rounded-2xl bg-red-500/95 px-4 py-2.5 text-center text-xs font-semibold text-white shadow-lg lg:hidden">
          {chatBlocked}
        </div>
      )}

      {/* Co-host invitation prompt */}
      {cohostInvite === 'invited' && (
        <div className="absolute inset-x-3 bottom-36 z-30 rounded-2xl bg-white p-4 shadow-xl lg:mx-auto lg:max-w-md">
          <p className="text-sm font-bold text-charcoal">Co-host invitation</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {hostName} invited you to publish in this stream. Your camera and mic will go live to
            every viewer.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={acceptCohost}
              disabled={cohostBusy}
              className="flex-1 rounded-full bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {cohostBusy ? 'Connecting…' : 'Accept and go live'}
            </button>
            <button
              onClick={declineCohost}
              className="rounded-full bg-cream px-5 py-2.5 text-sm font-semibold text-charcoal"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-5 pt-2 lg:hidden">
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
            className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
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
          onClick={() => tapLike(4)}
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
          <div className="gift-sheet relative animate-sheet-up rounded-t-[28px] bg-[#141419] px-4 pb-8 pt-3 shadow-sheet">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20" />
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
                  <GiftGlyph name={g.name} tier={g.tier} size="md" />
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

        {/* Gift bar: always visible under the stage (desktop) */}
        <div className="hidden h-[76px] shrink-0 items-center gap-2 border-t border-white/10 bg-[#0B0B0F] px-3 lg:flex">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            {catalog.map((g) => (
              <button
                key={g.id}
                onClick={() => sendGift(g)}
                disabled={sendingGift !== null}
                className={`flex shrink-0 flex-col items-center rounded-2xl border px-3 py-1 transition-all hover:border-primary/60 active:scale-95 disabled:opacity-50 ${
                  g.tier === 'mega'
                    ? 'border-gold/60 bg-gold/10'
                    : g.tier === 'luxury'
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-white/10 bg-white/5'
                }`}
              >
                <GiftGlyph name={g.name} tier={g.tier} size="sm" />
                <span className="text-[10px] font-medium leading-tight text-white">{g.name}</span>
                <span className="text-[10px] font-bold leading-tight text-gold">
                  {sendingGift === g.id ? '...' : g.coin_cost.toLocaleString()}
                </span>
              </button>
            ))}
            {catalog.length === 0 && (
              <span className="text-xs text-white/40">Gift catalog unavailable.</span>
            )}
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-gold/15 px-3 py-1.5 text-xs font-bold text-gold">
            <span className="inline-block h-3 w-3 rounded-full bg-gold" />
            {balance === null ? '...' : balance.toLocaleString()} coins
          </span>
          <button
            onClick={() => setGiftOpen(true)}
            className="shrink-0 rounded-full bg-white/10 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-white/15"
          >
            All gifts
          </button>
          <button
            onClick={() => tapLike(1)}
            aria-label="Like"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/40 active:scale-95"
          >
            <Heart className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Chat rail: host, viewers, top gifters, the full chat (desktop) */}
      <aside className="hidden w-[340px] shrink-0 flex-col border-l border-white/10 bg-[#0B0B0F] lg:flex">
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center gap-3">
            {stream?.provider?.avatar_url ? (
              <img
                src={stream.provider.avatar_url}
                alt={hostName}
                className="h-11 w-11 rounded-full object-cover"
                draggable={false}
              />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary font-bold text-white">
                {hostName[0]?.toUpperCase() ?? 'H'}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{hostName}</p>
              <p className="truncate text-xs text-white/50">{stream?.title ?? 'Live stream'}</p>
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold tracking-wide text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white">
              <Eye className="h-3.5 w-3.5" /> {formatCompactCount(viewerCount)} watching
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white">
              <Heart className="h-3.5 w-3.5" /> {formatCompactCount(likes)} likes
            </span>
          </div>
          {pinnedText && (
            <p className="mt-3 rounded-xl bg-gold/15 px-3 py-2 text-xs font-medium text-gold">
              Pinned: {pinnedText}
            </p>
          )}
        </div>

        <div className="border-b border-white/10 p-4">
          <GiftLeaderboard sessionId={id} variant="rail" />
        </div>

        <div
          ref={railChatRef}
          onScroll={(e) => {
            const el = e.currentTarget
            railStickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          }}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          <div className="flex flex-col gap-2">
            {visibleMessages.length === 0 && (
              <p className="text-xs text-white/40">No comments yet. Say the first hello.</p>
            )}
            {visibleMessages.map((m) => (
              <p key={m.id} className="text-[13px] leading-snug text-white">
                {typeof m.level === 'number' && (
                  <span className="mr-1 rounded-full bg-gold px-1.5 py-px align-middle text-[9px] font-bold text-charcoal">
                    FAN {m.level}
                  </span>
                )}
                {m.senderId && fanIds.has(m.senderId) && <FanBadge className="mr-1" />}
                <button
                  disabled={!canModerate || m.mine}
                  onClick={() => setModTarget(m)}
                  className={`font-semibold ${m.mine || (m.senderId && fanIds.has(m.senderId)) ? 'text-gold' : 'text-white/70'} ${canModerate && !m.mine ? 'underline decoration-dotted' : ''}`}
                >
                  {m.name}:{' '}
                </button>
                <span className="text-white/95">{m.body}</span>
              </p>
            ))}
          </div>
        </div>

        {chatBlocked && (
          <p className="mx-3 mb-2 rounded-xl bg-red-500/95 px-3 py-2 text-center text-xs font-semibold text-white">
            {chatBlocked}
          </p>
        )}

        <div className="flex items-center gap-2 border-t border-white/10 p-3">
          <div className="flex min-w-0 flex-1 items-center rounded-full bg-white/10">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChat()}
              placeholder="Say something nice..."
              maxLength={200}
              className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/40"
            />
            <button
              onClick={sendChat}
              disabled={!draft.trim()}
              aria-label="Send comment"
              className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
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
            onClick={() => tapLike(1)}
            aria-label="Like"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white active:scale-95"
          >
            <Heart className="h-5 w-5" />
          </button>
        </div>
      </aside>
    </div>
  )
}
