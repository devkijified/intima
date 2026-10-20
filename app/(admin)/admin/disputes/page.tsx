'use client'

import { useEffect, useState } from 'react'
import { ShieldAlert, ShieldCheck, Loader2 } from '@/lib/icons'

interface Party { id: string; name: string | null }
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
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-muted">
          <ShieldAlert className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold text-charcoal">Fee disputes</h1>
          <p className="text-sm text-neutral-500">Connection fees disputed inside their 24 hour protection window.</p>
        </div>
      </div>

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Open ({open.length})</h2>
      {open.length === 0 ? (
        <div className="card-luxe mt-3 flex items-center gap-3 p-5">
          <ShieldCheck className="h-6 w-6 text-emerald-500" />
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
              <div className="mt-3.5 flex gap-2">
                <button
                  onClick={() => resolve(d.id, 'refunded')}
                  disabled={busyId === d.id}
                  className="btn-luxe px-4 py-2 text-xs disabled:opacity-50"
                >
                  {busyId === d.id ? 'Working…' : 'Refund the client'}
                </button>
                <button
                  onClick={() => resolve(d.id, 'released')}
                  disabled={busyId === d.id}
                  className="btn-soft px-4 py-2 text-xs disabled:opacity-50"
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
                  {d.dispute_outcome === 'refunded' ? 'Refunded' : 'Released'} · {fmt(d.dispute_resolved_at)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
