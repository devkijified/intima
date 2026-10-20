'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CHAT_TEMPLATES, PROVIDER_QUICK_REPLIES } from '@/lib/chat/templates'
import ConnectionCare from '@/components/connections/ConnectionCare'
import { FanBadge } from '@/components/social/FanBadge'
import { ArrowLeft, Loader2, Send, Sparkles, Phone, Lock, Timer } from '@/lib/icons'

interface Msg {
  id: string
  sender_id: string
  body: string
  created_at: string
  media_url?: string | null
  media_type?: string | null
  ppv_price_coins?: number | null
  unlocked_by?: string[]
  expires_at?: string | null
  view_once?: boolean | null
}

interface Counterpart {
  id: string
  display_name: string | null
  avatar_url: string | null
  whatsapp_number: string | null
  isProvider: boolean
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ThreadPage() {
  const { id: connectionId } = useParams<{ id: string }>()
  const router = useRouter()
  const [me, setMe] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [other, setOther] = useState<Counterpart | null>(null)
  const [otherRating, setOtherRating] = useState<{ avg: number; count: number } | null>(null)
  const [connInfo, setConnInfo] = useState<{ feeNgn: number | null; feeState: string | null; disputeDeadline: string | null } | null>(null)
  const [intakeAnswers, setIntakeAnswers] = useState<{ q: string; a: string }[]>([])
  const [viewerIsProvider, setViewerIsProvider] = useState(false)
  const [otherIsFan, setOtherIsFan] = useState(false)
  const [showIntake, setShowIntake] = useState(false)
  const [active, setActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [showPpv, setShowPpv] = useState(false)
  const [disappearing, setDisappearing] = useState(false)
  const [ppvUrl, setPpvUrl] = useState('')
  const [ppvPrice, setPpvPrice] = useState('100')
  const [templateTab, setTemplateTab] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Media privacy (migration 044): who has viewed shared media.
  const [mediaViews, setMediaViews] = useState<{ message_id: string; viewer_id: string }[]>([])
  const [viewerMsg, setViewerMsg] = useState<Msg | null>(null)
  const [screenshotNotice, setScreenshotNotice] = useState(false)

  // Record that I viewed their media. Best effort: the primary key
  // makes repeats harmless, and duplicate errors are ignored.
  const recordMediaView = async (msg: Msg) => {
    if (!me || msg.sender_id === me || !msg.media_url) return
    setMediaViews((prev) =>
      prev.some((v) => v.message_id === msg.id && v.viewer_id === me)
        ? prev
        : [...prev, { message_id: msg.id, viewer_id: me }]
    )
    try {
      await createClient()
        .from('media_views')
        .insert({ message_id: msg.id, viewer_id: me })
    } catch {
      // Duplicate or offline: the local state already reflects the view.
    }
  }

  // Opening media in the viewer counts as the view (this is also the
  // single allowed open for view-once media).
  const openMediaViewer = (msg: Msg) => {
    void recordMediaView(msg)
    setViewerMsg(msg)
  }

  // Screenshot deterrent while the viewer is open: a PrintScreen
  // keypress or the window losing focus closes the viewer and leaves
  // a notice in the thread. This deters casual captures only; the
  // viewer footer says so honestly.
  useEffect(() => {
    if (!viewerMsg) return
    const flagAttempt = () => {
      setViewerMsg(null)
      setScreenshotNotice(true)
      setTimeout(() => setScreenshotNotice(false), 5000)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') flagAttempt()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', flagAttempt)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', flagAttempt)
    }
  }, [viewerMsg])

  useEffect(() => {
    let live = true
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      if (live) setMe(user.id)

      const { data: conn } = await supabase
        .from('connections')
        .select('id, client_id, provider_id, status, fee_ngn, fee_state, dispute_deadline, intake_answers')
        .eq('id', connectionId)
        .single()
      if (!conn || (conn.client_id !== user.id && conn.provider_id !== user.id)) {
        router.replace('/messages'); return
      }
      if (live) {
        setActive(conn.status === 'active')
        setConnInfo({
          feeNgn: conn.fee_ngn ?? null,
          feeState: conn.fee_state ?? null,
          disputeDeadline: conn.dispute_deadline ?? null,
        })
        setViewerIsProvider(conn.provider_id === user.id)
        const rawAnswers = (conn as { intake_answers?: unknown }).intake_answers
        setIntakeAnswers(
          Array.isArray(rawAnswers)
            ? rawAnswers
                .filter(
                  (x): x is { q: string; a: string } =>
                    !!x && typeof x === 'object' && typeof (x as { q?: unknown }).q === 'string' && typeof (x as { a?: unknown }).a === 'string'
                )
                .slice(0, 3)
            : []
        )
      }

      const otherId = conn.client_id === user.id ? conn.provider_id : conn.client_id

      // Fan badge: when the viewer is the provider, check whether the
      // client has an effective fan club subscription to her.
      if (conn.provider_id === user.id) {
        try {
          const res = await fetch(
            `/api/subscriptions/subscribers?provider_id=${encodeURIComponent(user.id)}`
          )
          if (res.ok) {
            const j = await res.json()
            if (live && Array.isArray(j.subscriberIds) && j.subscriberIds.includes(otherId)) {
              setOtherIsFan(true)
            }
          }
        } catch { /* badge is best effort */ }
      }
      const { data: prof } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, whatsapp_number, role')
        .eq('id', otherId)
        .single()
      if (live && prof) {
        setOther({
          id: otherId,
          display_name: prof.display_name,
          avatar_url: prof.avatar_url,
          // WhatsApp only revealed on an ACTIVE (paid) connection.
          whatsapp_number: conn.status === 'active' ? (prof.whatsapp_number ?? null) : null,
          isProvider: prof.role === 'model',
        })
      }

      // Their published rating, so both sides see who they are dealing
      // with (the Bybit habit). RLS only returns published reviews.
      const { data: theirReviews } = await supabase
        .from('reviews')
        .select('rating')
        .eq('reviewee_id', otherId)
        .eq('status', 'published')
      if (live && theirReviews && theirReviews.length > 0) {
        const avg = theirReviews.reduce((s, r) => s + (r.rating ?? 0), 0) / theirReviews.length
        setOtherRating({ avg: Math.round(avg * 10) / 10, count: theirReviews.length })
      }

      const { data: history } = await supabase
        .from('messages')
        .select('id, sender_id, body, created_at, media_url, media_type, ppv_price_coins, unlocked_by, view_once')
        .eq('connection_id', connectionId)
        .order('created_at', { ascending: true })
      const fresh = (history ?? []).filter((m: any) => !m.expires_at || new Date(m.expires_at).getTime() > Date.now())
      if (live) { setMsgs(fresh as Msg[]); setLoading(false) }

      // Media view state for this thread: drives my view-once blur
      // and the sender side Seen labels. RLS returns only rows I am
      // allowed to see (my own views, plus views of my media).
      const mediaIds = (fresh as Msg[]).filter((m) => m.media_url).map((m) => m.id)
      if (mediaIds.length > 0) {
        const { data: views } = await supabase
          .from('media_views')
          .select('message_id, viewer_id')
          .in('message_id', mediaIds)
        if (live && views) {
          setMediaViews(views as { message_id: string; viewer_id: string }[])
        }
      }
      // Mark their messages as read (best effort; read_at drives unread badges).
      supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('connection_id', connectionId)
        .neq('sender_id', user.id)
        .is('read_at', null)
        .then(() => {})

      // Realtime: new messages in this thread.
      const channel = supabase
        .channel(`thread-${connectionId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `connection_id=eq.${connectionId}` },
          (payload) => {
            const m = payload.new as Msg
            if (m.expires_at && new Date(m.expires_at).getTime() <= Date.now()) return
            if (live) setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
          }
        )
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    })()
    return () => { live = false }
  }, [connectionId, router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  const send = async (body: string) => {
    const text = body.trim()
    if (!text || !me || sending || !active) return
    setSending(true)
    const supabase = createClient()
    const { data: row, error } = await supabase.from('messages').insert({
      connection_id: connectionId,
      sender_id: me,
      body: text.slice(0, 1000),
      ...(disappearing ? { expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString() } : {}),
    }).select('id, sender_id, body, created_at, media_url, media_type, ppv_price_coins, unlocked_by, view_once').single()
    setSending(false)
    if (!error) {
      // Show the message immediately from the insert result. Relying on
      // the realtime echo alone made sends look lost (the echo can lag
      // or miss), which invited duplicate retries. The realtime handler
      // dedupes by id, so appending here is safe.
      if (row) {
        const m = row as Msg
        setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      }
      setInput('')
      setShowTemplates(false)
      // Push the other side (best effort): a message nobody hears about
      // until they happen to open the app is a message half delivered.
      if (other?.id) {
        void fetch('/api/push/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_ids: [other.id],
            type: 'booking_message',
            title: 'New message',
            body: text.slice(0, 80),
            link: `/messages/${connectionId}`,
          }),
        }).catch(() => {})
      }
    }
  }

  const templates = other?.isProvider ? CHAT_TEMPLATES : CHAT_TEMPLATES
  const quickReplies = !other?.isProvider ? PROVIDER_QUICK_REPLIES : null

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-2xl flex-col md:h-[calc(100dvh-5rem)]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-100 bg-white px-4 py-3">
        <button onClick={() => router.back()} aria-label="Back" className="rounded-full p-1 hover:bg-cream">
          <ArrowLeft className="h-5 w-5 text-charcoal" />
        </button>
        {other?.avatar_url ? (
          <img src={other.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cream font-display text-neutral-400">
            {(other?.display_name?.[0] ?? '?').toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-charcoal">
            {other?.display_name ?? 'Member'}
            {otherIsFan && <FanBadge className="ml-1.5" />}
          </p>
          <p className={`text-xs ${!loading && active ? 'text-emerald-600' : 'text-neutral-400'}`}>
            {loading ? 'Loading…' : active ? 'Connection active' : 'Connection not active'}
            {otherRating && (
              <span className="text-neutral-500"> · ★ {otherRating.avg} ({otherRating.count} review{otherRating.count === 1 ? '' : 's'})</span>
            )}
          </p>
        </div>
        {other?.whatsapp_number && (
          <a
            href={`https://wa.me/${other.whatsapp_number.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat on WhatsApp"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366]/15"
          >
            <Phone className="h-5 w-5 text-[#128C4B]" />
          </a>
        )}
      </div>

      {/* Fee protection + double-blind reviews */}
      {active && connInfo && (
        <ConnectionCare
          connectionId={connectionId}
          feeState={connInfo.feeState}
          disputeDeadline={connInfo.disputeDeadline}
          feeNgn={connInfo.feeNgn}
          otherName={other?.display_name ?? 'them'}
          viewerIsClient={!!other?.isProvider}
        />
      )}

      {/* Screening answers: providers only, so she can screen before chatting */}
      {viewerIsProvider && intakeAnswers.length > 0 && (
        <div className="shrink-0 border-b border-black/[0.05] bg-white px-4 py-3">
          <button
            onClick={() => setShowIntake((v) => !v)}
            className="flex w-full items-center justify-between text-left"
            aria-expanded={showIntake}
          >
            <span className="text-[13px] font-semibold text-charcoal">Client answers</span>
            <span className="text-xs font-medium text-primary">{showIntake ? 'Hide' : 'View'}</span>
          </button>
          {showIntake && (
            <div className="mt-2 space-y-2.5">
              {intakeAnswers.map((item, i) => (
                <div key={i} className="rounded-xl bg-cream/70 px-3 py-2.5">
                  <p className="text-xs font-semibold text-neutral-500">{item.q}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-charcoal">{item.a}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-cream/40 px-4 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-neutral-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : msgs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="font-display text-lg font-semibold text-charcoal">Say hello</p>
            <p className="mt-1 max-w-xs text-sm text-neutral-500">
              Pick a template below to start the conversation. Keep it respectful.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {msgs.map((m) => {
              const mine = m.sender_id === me
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      mine
                        ? 'rounded-br-md bg-primary text-white'
                        : 'rounded-bl-md bg-white text-charcoal shadow-xs'
                    }`}
                  >
                    <p>{m.body}</p>
                    {m.media_url && (
                      <PpvMedia
                        msg={m}
                        me={me}
                        hasViewed={mediaViews.some((v) => v.message_id === m.id && v.viewer_id === me)}
                        onOpen={openMediaViewer}
                        onViewed={recordMediaView}
                      />
                    )}
                    <p className={`mt-1 text-right text-[10px] ${mine ? 'text-white/70' : 'text-neutral-400'}`}>
                      {fmtTime(m.created_at)}
                    </p>
                    {mine && m.media_url && mediaViews.some((v) => v.message_id === m.id && v.viewer_id !== me) && (
                      <p className={`text-right text-[10px] font-medium ${mine ? 'text-white/70' : 'text-neutral-400'}`}>
                        Seen
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {screenshotNotice && (
        <div className="shrink-0 border-t border-amber-100 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-700">
          Screenshot attempt detected. Shared media is private between you two.
        </div>
      )}

      {/* Templates (Lagos Life style) */}
      {showTemplates && active && (
        <div className="shrink-0 border-t border-neutral-100 bg-white px-4 pb-2 pt-3">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {templates.map((g, i) => (
              <button
                key={g.id}
                onClick={() => setTemplateTab(i)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                  templateTab === i ? 'bg-charcoal text-white' : 'bg-cream text-neutral-600'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5 pb-1">
            {templates[templateTab].phrases.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                disabled={sending}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-sm text-charcoal transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
              >
                {p}
              </button>
            ))}
            {quickReplies && (
              <>
                <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Quick replies
                </p>
                {quickReplies.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    disabled={sending}
                    className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-sm text-charcoal transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* PPV panel */}
      {showPpv && active && (
        <div className="shrink-0 border-t border-neutral-100 bg-gold/5 px-4 py-3">
          <p className="text-xs font-semibold text-charcoal">Send locked media (PPV)</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input value={ppvUrl} onChange={(e) => setPpvUrl(e.target.value)} placeholder="Photo or video URL" className="flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-gold" />
            <input value={ppvPrice} onChange={(e) => setPpvPrice(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Coins" inputMode="numeric" className="w-28 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-gold" />
            <button
              onClick={async () => {
                const url = ppvUrl.trim()
                const price = parseInt(ppvPrice, 10)
                if (!url || !price || price <= 0 || !me) return
                const isVideo = /\.mp4|\.webm/i.test(url)
                const { data: row, error } = await createClient().from('messages').insert({
                  connection_id: connectionId,
                  sender_id: me,
                  body: 'Locked media',
                  media_url: url,
                  media_type: isVideo ? 'video' : 'image',
                  ppv_price_coins: price,
                }).select('id, sender_id, body, created_at, media_url, media_type, ppv_price_coins, unlocked_by, view_once').single()
                if (!error) {
                  if (row) {
                    const m = row as Msg
                    setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
                  }
                  setPpvUrl(''); setShowPpv(false)
                  if (other?.id) {
                    void fetch('/api/push/notify', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        user_ids: [other.id],
                        type: 'booking_message',
                        title: 'New locked media',
                        body: 'You received locked media in your chat.',
                        link: `/messages/${connectionId}`,
                      }),
                    }).catch(() => {})
                  }
                }
              }}
              className="rounded-xl bg-gold px-4 py-2 text-sm font-bold text-charcoal"
            >
              Send locked
            </button>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">Clients pay coins to view. You keep your share automatically.</p>
        </div>
      )}

      {/* Composer */}
      <div className="shrink-0 border-t border-neutral-100 bg-white px-4 py-3">
        {!loading && !active && (
          <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            This connection is not active. Chat unlocks after payment.
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplates((v) => !v)}
            disabled={!active}
            aria-label="Message templates"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
              showTemplates ? 'bg-gold/20' : 'bg-cream'
            } disabled:opacity-40`}
          >
            <Sparkles className="h-5 w-5 text-gold" />
          </button>
          <button
            onClick={() => setDisappearing((v) => !v)}
            aria-label="Disappearing messages"
            title="Disappearing messages (24h)"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${disappearing ? 'bg-primary/15' : 'bg-cream'} disabled:opacity-40`}
          >
            <Timer className={`h-4 w-4 ${disappearing ? 'text-primary' : 'text-neutral-500'}`} />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
            placeholder={active ? 'Type a message...' : 'Chat locked'}
            disabled={!active || sending}
            maxLength={1000}
            className="min-w-0 flex-1 rounded-full border border-neutral-200 bg-cream/60 px-4 py-2.5 text-sm text-charcoal outline-none placeholder:text-neutral-400 focus:border-primary disabled:opacity-50"
          />
          {!other?.isProvider && active && (
            <button
              onClick={() => setShowPpv((v) => !v)}
              aria-label="Send locked media"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/20 text-gold"
            >
              <Lock className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => send(input)}
            disabled={!active || sending || !input.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Media viewer overlay: the one place shared media opens big.
          PrintScreen or a window blur closes it (see effect above). */}
      {viewerMsg && viewerMsg.media_url && (
        <div
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/95"
          onClick={() => setViewerMsg(null)}
        >
          <button
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg text-white"
          >
            ×
          </button>
          <div className="max-h-[82vh] w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
            {viewerMsg.media_type === 'video' ? (
              <video src={viewerMsg.media_url} controls autoPlay className="max-h-[76vh] w-full rounded-2xl object-contain" />
            ) : (
              <img src={viewerMsg.media_url} alt="" className="max-h-[76vh] w-full rounded-2xl object-contain" draggable={false} />
            )}
          </div>
          <p className="px-6 pb-5 text-center text-[11px] text-white/50">
            We discourage screenshots, but no app can fully prevent them.
          </p>
        </div>
      )}
    </div>
  )
}

/** Locked media in chat: unlock with coins via the server. */
function PpvMedia({
  msg,
  me,
  hasViewed,
  onOpen,
  onViewed,
}: {
  msg: Msg
  me: string | null
  hasViewed: boolean
  onOpen: (msg: Msg) => void
  onViewed: (msg: Msg) => void
}) {
  const [busy, setBusy] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const price = msg.ppv_price_coins ?? 0
  const isMine = msg.sender_id === me
  const isOpen = isMine || unlocked || (msg.unlocked_by ?? []).includes(me ?? '') || price <= 0

  async function unlock() {
    if (busy) return
    setBusy(true)
    const res = await fetch('/api/chat/ppv/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: msg.id }),
    })
    setBusy(false)
    if (res.ok) {
      setUnlocked(true)
      // Unlocking is the view for paid media: record it for the
      // sender. View-once media opens in the viewer instead, so the
      // single allowed open is a real look, not just the unlock.
      if (msg.view_once) {
        onOpen(msg)
      } else {
        onViewed(msg)
      }
    } else if (res.status === 402) {
      alert(`Not enough coins. You need ${price} coins. Top up from Coins.`)
    } else {
      alert('Could not unlock. Please try again.')
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={unlock}
        disabled={busy}
        className="relative mt-2 block h-44 w-56 overflow-hidden rounded-xl bg-neutral-800 text-left"
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 backdrop-blur-md">
          <span className="text-sm font-semibold text-white">Locked {msg.media_type === 'video' ? 'video' : 'photo'}</span>
          <span className="rounded-full bg-gold px-3 py-1 text-xs font-bold text-charcoal">
            {busy ? 'Unlocking…' : `Unlock · ${price} coins`}
          </span>
        </div>
      </button>
    )
  }

  // View-once, already opened by me: the media stays blurred for
  // good. The sender keeps her normal view of her own media.
  if (!isMine && msg.view_once && hasViewed) {
    return (
      <div className="relative mt-2 block h-44 w-56 overflow-hidden rounded-xl bg-neutral-800">
        {msg.media_type === 'video' ? (
          <video src={msg.media_url!} className="h-full w-full object-cover blur-xl" muted playsInline />
        ) : (
          <img src={msg.media_url!} alt="" className="h-full w-full object-cover blur-xl" draggable={false} />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 px-4 text-center">
          <span className="text-xs font-semibold text-white">
            Already viewed. View once media can only be opened once.
          </span>
        </div>
      </div>
    )
  }

  // View-once, not opened yet: a deliberate tap is the one open, so
  // loading the thread never burns it.
  if (!isMine && msg.view_once && !hasViewed) {
    return (
      <button
        onClick={() => onOpen(msg)}
        className="relative mt-2 block h-44 w-56 overflow-hidden rounded-xl bg-neutral-800 text-left"
      >
        {msg.media_type === 'video' ? (
          <video src={msg.media_url!} className="h-full w-full object-cover blur-xl" muted playsInline />
        ) : (
          <img src={msg.media_url!} alt="" className="h-full w-full object-cover blur-xl" draggable={false} />
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45">
          <span className="text-sm font-semibold text-white">View once</span>
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-charcoal">
            Tap to open
          </span>
        </div>
      </button>
    )
  }

  if (msg.media_type === 'video') {
    return (
      <video
        src={msg.media_url!}
        controls
        onPlay={() => onViewed(msg)}
        className="mt-2 max-h-64 w-56 rounded-xl object-cover"
      />
    )
  }
  return (
    <img
      src={msg.media_url!}
      alt=""
      onClick={() => onOpen(msg)}
      className="mt-2 max-h-64 w-56 cursor-pointer rounded-xl object-cover"
      draggable={false}
    />
  )
}
