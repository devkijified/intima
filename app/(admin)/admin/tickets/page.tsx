'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Loader2, Send, Ticket } from '@/lib/icons'

interface TicketRow {
  id: string
  user_id: string
  subject: string
  category: string
  status: 'open' | 'answered' | 'resolved' | 'closed'
  last_message_at: string
  ownerName: string | null
}

interface TicketMessage {
  id: string
  sender_role: 'user' | 'admin'
  body: string
  created_at: string
}

const TABS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'answered', label: 'Answered' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
] as const

const STATUS_CLS: Record<TicketRow['status'], string> = {
  open: 'bg-primary-muted text-primary',
  answered: 'bg-emerald-50 text-emerald-700',
  resolved: 'bg-neutral-100 text-neutral-500',
  closed: 'bg-neutral-100 text-neutral-400',
}

/**
 * Admin: the support queue. Pick a ticket to read the thread,
 * reply (marks it answered), resolve or reopen. Members are told
 * about every support reply by bell and push.
 */
export default function AdminTicketsPage() {
  const [tab, setTab] = useState('')
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<TicketRow | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const qs = tab ? `?status=${tab}` : ''
    const res = await fetch(`/api/tickets${qs}`)
    const d = await res.json().catch(() => ({}))
    if (res.ok) setTickets(d.tickets ?? [])
    setLoading(false)
  }, [tab])

  useEffect(() => { void load() }, [load])

  const openThread = useCallback(async (t: TicketRow) => {
    setSelected(t)
    setThreadLoading(true)
    setMsg('')
    const res = await fetch(`/api/tickets/${t.id}`)
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      setMessages(d.messages ?? [])
      setSelected({ ...t, status: d.ticket.status, ownerName: d.ticket.ownerName ?? t.ownerName })
    }
    setThreadLoading(false)
  }, [])

  async function act(body: Record<string, unknown>, note: string) {
    if (!selected) return
    setBusy(true)
    setMsg('')
    const res = await fetch(`/api/tickets/${selected.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) {
      setDraft('')
      setMsg(note)
      await openThread({ ...selected, status: d.status })
      void load()
    } else {
      setMsg(d.error ?? 'That did not go through. Please try again.')
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="t-page-title flex items-center gap-2.5 text-charcoal">
          <Ticket aria-hidden className="h-6 w-6 text-primary" /> Support tickets
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Private help threads from companions and clients. Replying tells the member right away.
        </p>
      </div>

      <div className="scroll-row gap-2 pb-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full px-4 py-2 text-sm font-medium ${
              tab === t.value ? 'bg-[#AC244D] text-white' : 'bg-white text-gray-600 ring-1 ring-neutral-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[380px_1fr]">
        <div className="space-y-2.5">
          {loading ? (
            <div className="h-28 animate-pulse rounded-3xl bg-neutral-100" />
          ) : tickets.length === 0 ? (
            <p className="rounded-3xl bg-white p-6 text-center text-sm text-neutral-500 ring-1 ring-black/[0.04]">
              No tickets in this view.
            </p>
          ) : (
            tickets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => void openThread(t)}
                className={`block w-full rounded-3xl bg-white p-4 text-left ring-1 shadow-soft transition-all active:scale-[0.99] ${
                  selected?.id === t.id ? 'ring-2 ring-primary' : 'ring-black/[0.045]'
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold tracking-tight text-charcoal">
                    {t.subject}
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_CLS[t.status]}`}>
                    {t.status}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-neutral-500">
                  {t.ownerName ?? 'Member'} · {t.category} ·{' '}
                  {new Date(t.last_message_at).toLocaleString('en-GB', {
                    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                  })}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="card-luxe p-5">
          {!selected ? (
            <p className="py-10 text-center text-sm text-neutral-400">
              Pick a ticket to read the thread and reply.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary lg:hidden"
              >
                <ArrowLeft aria-hidden className="h-4 w-4" /> All tickets
              </button>
              <h2 className="t-section-title text-charcoal">{selected.subject}</h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                From {selected.ownerName ?? 'a member'} · {selected.category}
              </p>
              {threadLoading ? (
                <div className="mt-4 h-32 animate-pulse rounded-3xl bg-neutral-100" />
              ) : (
                <div className="mt-4 space-y-3">
                  {messages.map((m) => {
                    const fromMember = m.sender_role === 'user'
                    return (
                      <div key={m.id} className={`flex ${fromMember ? 'justify-start' : 'justify-end'}`}>
                        <div
                          className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-relaxed ${
                            fromMember
                              ? 'rounded-bl-lg bg-cream text-charcoal'
                              : 'rounded-br-lg bg-primary text-white'
                          }`}
                        >
                          <p className={`mb-1 text-[11px] font-bold uppercase tracking-[0.12em] ${fromMember ? 'text-neutral-400' : 'text-white/70'}`}>
                            {fromMember ? (selected.ownerName ?? 'Member') : 'Support'}
                          </p>
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p className={`mt-1.5 text-right text-[11px] ${fromMember ? 'text-neutral-400' : 'text-white/70'}`}>
                            {new Date(m.created_at).toLocaleString('en-GB', {
                              day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Reply as Intima Support…"
                rows={3}
                maxLength={4000}
                className="mt-5 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base outline-none focus:border-primary md:text-sm"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !draft.trim()}
                  onClick={() => void act({ body: draft.trim() }, 'Reply sent. The member has been told.')}
                  className="btn-luxe inline-flex min-h-[44px] items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50"
                >
                  {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Send aria-hidden className="h-4 w-4" />}
                  Send reply
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act({ status: 'resolved' }, 'Ticket marked resolved.')}
                  className="btn-soft inline-flex min-h-[44px] items-center px-4 py-2.5 text-sm disabled:opacity-50"
                >
                  Mark resolved
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act({ status: 'open' }, 'Ticket reopened.')}
                  className="btn-soft inline-flex min-h-[44px] items-center px-4 py-2.5 text-sm disabled:opacity-50"
                >
                  Reopen
                </button>
              </div>
              {msg && <p className="mt-2 text-sm text-neutral-600">{msg}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
