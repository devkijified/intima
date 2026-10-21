'use client'

import { useEffect, useState } from 'react'
import { ShieldAlert, ShieldCheck, Loader2 } from '@/lib/icons'

interface Party { id: string; name: string | null }
interface DisputeEvent {
  id: string
  kind: string
  note: string | null
  evidence_path: string | null
  evidence_url: string | null
  actor_id: string | null
  actor: Party | null
  created_at: string
}
interface Dispute {
  id: string
  fee_ngn: number
  status: string
  fee_state: string
  dispute_reason: string | null
  dispute_opened_at: string | null
  dispute_resolved_at: string | null
  dispute_outcome: string | null
  client: Party
  provider: Party
  openedBy: Party | null
  events?: DisputeEvent[]
}

function eventLabel(ev: DisputeEvent): string {
  if (ev.kind === 'opened') return 'Dispute opened'
  if (ev.kind === 'evidence') return 'Evidence added'
  if (ev.kind === 'note') return 'Note'
  if (ev.kind === 'resolved') {
    return ev.note === 'refunded' ? 'Resolved: fee refunded' : 'Resolved: fee released'
  }
  if (ev.kind === 'auto_released') return 'Closed automatically: fee released'
  return ev.kind
}

function DisputeTimeline({ events }: { events: DisputeEvent[] }) {
  if (events.length === 0) return null
  return (
    <div className="mt-3.5 space-y-2.5 border-t border-black/[0.05] pt-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Timeline</p>
      {events.map((ev) => (
        <div key={ev.id} className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-charcoal">
              {eventLabel(ev)}
              <span className="ml-1.5 text-[11px] font-normal text-neutral-400">
                {fmt(ev.created_at)}{ev.actor ? ` · ${ev.actor.name ?? 'A party'}` : ''}
              </span>
            </p>
            {ev.kind === 'opened' && ev.note && (
              <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-600">{ev.note}</p>
            )}
            {ev.kind === 'evidence' && ev.note && (
              <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-600">{ev.note}</p>
            )}
            {ev.kind === 'evidence' && ev.evidence_url && (
              <a href={ev.evidence_url} target="_blank" rel="noreferrer">
                <img src={ev.evidence_url} alt="Dispute evidence" className="mt-1.5 h-24 w-24 rounded-xl object-cover ring-1 ring-black/[0.06]" />
              </a>
            )}
            {ev.kind === 'evidence' && !ev.evidence_url && ev.evidence_path && (
              <p className="mt-0.5 text-[11px] text-neutral-400">Evidence photo on file (preview unavailable).</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function fmt(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AdminDisputesPage() {
  const [open, setOpen] = useState<Dispute[]>([])
  const [resolved, setResolved] = useState<Dispute[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      const res = await fetch('/api/admin/disputes')
      if (!res.ok) throw new Error('Could not load disputes')
      const data = await res.json()
      setOpen(data.open ?? [])
      setResolved(data.resolved ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load disputes')
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function resolve(id: string, outcome: 'refunded' | 'released') {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch('/api/admin/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: id, outcome }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not resolve')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resolve')
    }
    setBusyId(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-neutral-400">
        <Loader2 aria-hidden className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-muted">
          <ShieldAlert aria-hidden className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-charcoal">Fee disputes</h1>
          <p className="text-sm text-neutral-500">Connection fees disputed inside their 24 hour protection window.</p>
        </div>
      </div>

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Open ({open.length})</h2>
      {open.length === 0 ? (
        <div className="card-luxe mt-3 flex items-center gap-3 p-5">
          <ShieldCheck aria-hidden className="h-6 w-6 text-emerald-500" />
          <p className="text-sm text-neutral-500">No open disputes. Every fee is either inside its window or settled.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {open.map((d) => (
            <div key={d.id} className="card-luxe p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-charcoal">
                  ₦{d.fee_ngn.toLocaleString()} fee · {d.provider.name ?? 'Companion'} ↔ {d.client.name ?? 'Client'}
                </p>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-100">
                  Opened {fmt(d.dispute_opened_at)}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{d.dispute_reason}</p>
              <p className="mt-1 text-xs text-neutral-400">Opened by {d.openedBy?.name ?? 'a party to the connection'}</p>
              <DisputeTimeline events={d.events ?? []} />
              <div className="mt-3.5 flex gap-2">
                <button
                  onClick={() => resolve(d.id, 'refunded')}
                  disabled={busyId === d.id}
                  className="btn-luxe min-h-[44px] px-4 py-2 text-xs disabled:opacity-50"
                >
                  {busyId === d.id ? 'Working…' : 'Refund the client'}
                </button>
                <button
                  onClick={() => resolve(d.id, 'released')}
                  disabled={busyId === d.id}
                  className="btn-soft min-h-[44px] px-4 py-2 text-xs disabled:opacity-50"
                >
                  Release the fee
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
                Refunding closes the connection and marks the fee for return through the original payment rail. Releasing ends the window and the fee stands.
              </p>
            </div>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <>
          <h2 className="mt-10 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Recently resolved</h2>
          <div className="mt-3 space-y-2">
            {resolved.map((d) => (
              <div key={d.id} className="card-luxe flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                <p className="text-[13px] text-neutral-600">
                  ₦{d.fee_ngn.toLocaleString()} · {d.provider.name ?? 'Companion'} ↔ {d.client.name ?? 'Client'}
                </p>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${d.dispute_outcome === 'refunded' ? 'bg-red-50 text-red-600 ring-red-100' : 'bg-emerald-50 text-emerald-600 ring-emerald-100'}`}>
                  {d.dispute_outcome === 'refunded' ? 'Refunded' : d.dispute_outcome === 'auto_released' ? 'Auto released' : 'Released'} · {fmt(d.dispute_resolved_at)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
