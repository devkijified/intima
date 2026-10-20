'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CHAT_TEMPLATES, PROVIDER_QUICK_REPLIES } from '@/lib/chat/templates'
import { ArrowLeft, Loader2, Send, Sparkles, Phone, Lock } from '@/lib/icons'

interface Msg {
  id: string
  sender_id: string
  body: string
  created_at: string
  media_url?: string | null
  media_type?: string | null
  ppv_price_coins?: number | null
  unlocked_by?: string[]
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
  const [active, setActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [showPpv, setShowPpv] = useState(false)
  const [ppvUrl, setPpvUrl] = useState('')
  const [ppvPrice, setPpvPrice] = useState('100')
  const [templateTab, setTemplateTab] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      if (live) setMe(user.id)

      const { data: conn } = await supabase
        .from('connections')
        .select('id, client_id, provider_id, status')
        .eq('id', connectionId)
        .single()
      if (!conn || (conn.client_id !== user.id && conn.provider_id !== user.id)) {
        router.replace('/messages'); return
      }
      if (live) setActive(conn.status === 'active')

      const otherId = conn.client_id === user.id ? conn.provider_id : conn.client_id
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

      const { data: history } = await supabase
        .from('messages')
        .select('id, sender_id, body, created_at, media_url, media_type, ppv_price_coins, unlocked_by')
        .eq('connection_id', connectionId)
        .order('created_at', { ascending: true })
      if (live) { setMsgs(history ?? []); setLoading(false) }
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
    const { error } = await createClient().from('messages').insert({
      connection_id: connectionId,
      sender_id: me,
      body: text.slice(0, 1000),
    })
    setSending(false)
    if (!error) {
      setInput('')
      setShowTemplates(false)
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
          </p>
          <p className={`text-xs ${active ? 'text-emerald-600' : 'text-neutral-400'}`}>
            {active ? 'Connection active' : 'Connection not active'}
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-cream/40 px-4 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-neutral-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : msgs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="font-display text-lg font-semibold text-charcoal">Say hello 👋</p>
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
                    {m.media_url && <PpvMedia msg={m} me={me} />}
                    <p className={`mt-1 text-right text-[10px] ${mine ? 'text-white/70' : 'text-neutral-400'}`}>
                      {fmtTime(m.created_at)}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

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
                const { error } = await createClient().from('messages').insert({
                  connection_id: connectionId,
                  sender_id: me,
                  body: 'Locked media',
                  media_url: url,
                  media_type: isVideo ? 'video' : 'image',
                  ppv_price_coins: price,
                })
                if (!error) { setPpvUrl(''); setShowPpv(false) }
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
        {!active && (
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
    </div>
  )
}

/** Locked media in chat: unlock with coins via the server. */
function PpvMedia({ msg, me }: { msg: Msg; me: string | null }) {
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
    } else if (res.status === 402) {
      alert(`Not enough coins. You need ${price} coins — top up from Coins.`)
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

  if (msg.media_type === 'video') {
    return <video src={msg.media_url!} controls className="mt-2 max-h-64 w-56 rounded-xl object-cover" />
  }
  return <img src={msg.media_url!} alt="" className="mt-2 max-h-64 w-56 rounded-xl object-cover" />
}
