'use client'

import { useEffect, useState } from 'react'
import { ListChecks } from '@/lib/icons'
import { IntimaLoader } from '@/components/shared/IntimaLoader'
import { formatCompactPrice } from '@/lib/utils/helpers'

interface Person { display_name: string | null; username: string | null }
interface BoardRow {
  id: string
  city: string
  service_type: string
  proposed_rate_ngn: number
  timing: string
  status: string
  refund_state: string | null
  payment_rail: string | null
  payment_ref: string | null
  expires_at: string | null
  created_at: string
  responses: number
  client: Person | null
  picked: Person | null
  connection_id: string | null
}

const STATUS_STYLES: Record<string, string> = {
  awaiting_payment: 'bg-amber-50 text-amber-700',
  open: 'bg-emerald-50 text-emerald-700',
  filled: 'bg-primary/10 text-primary',
  expired: 'bg-neutral-100 text-neutral-500',
  cancelled: 'bg-neutral-100 text-neutral-500',
}

export default function AdminBoardPage() {
  const [rows, setRows] = useState<BoardRow[] | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const load = async () => {
    const res = await fetch('/api/admin/board')
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error ?? 'Could not load the board')
      setRows([])
      return
    }
    setRows(data.requests ?? [])
  }

  useEffect(() => { load() }, [])

  const retryRefund = async (id: string) => {
    setBusyId(id)
    setNote('')
    try {
      const res = await fetch(`/api/admin/board/${id}/refund`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setNote(data?.error ?? 'Refund retry failed')
      } else {
        setNote(`Refund state: ${data.refund_state}`)
        await load()
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
          <ListChecks aria-hidden className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold text-charcoal">Request board</h1>
          <p className="text-sm text-neutral-500">Every posted request, its responses, and fee refunds.</p>
        </div>
      </div>

      {note && <p className="mt-4 rounded-xl bg-primary/5 px-4 py-3 text-sm text-charcoal">{note}</p>}
      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      {rows === null ? (
        <div data-page-loader className="mt-10 flex justify-center"><IntimaLoader size="lg" /></div>
      ) : rows.length === 0 ? (
        <p className="mt-10 text-sm text-neutral-500">No requests yet. When a client posts one, it shows here.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-black/[0.06] bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[r.status] ?? 'bg-neutral-100 text-neutral-500'}`}>
                  {r.status.replace('_', ' ')}
                </span>
                <span className="text-sm font-medium text-charcoal">{r.city}</span>
                <span className="text-sm text-neutral-500">{r.service_type}</span>
                <span className="text-sm font-semibold text-charcoal">{formatCompactPrice(r.proposed_rate_ngn)}</span>
                <span className="text-xs text-neutral-400">{r.responses} responses</span>
                {r.refund_state && (
                  <span className="text-xs text-neutral-500">refund: {r.refund_state}</span>
                )}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                Client: {r.client?.display_name ?? 'Unknown'}
                {r.picked ? ` · Picked: ${r.picked.display_name ?? 'Unknown'}` : ''}
                {r.payment_ref ? ` · Ref ${r.payment_ref}` : ''}
                {r.payment_rail ? ` · ${r.payment_rail}` : ''}
                {' · '}Posted {new Date(r.created_at).toLocaleString()}
                {r.expires_at ? ` · Expires ${new Date(r.expires_at).toLocaleString()}` : ''}
              </p>
              {(r.status === 'expired' || r.status === 'cancelled') &&
                r.refund_state !== 'refunded' &&
                r.payment_rail === 'card' && (
                  <button
                    onClick={() => retryRefund(r.id)}
                    disabled={busyId === r.id}
                    className="mt-3 inline-flex min-h-[40px] items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {busyId === r.id ? 'Retrying…' : 'Retry refund'}
                  </button>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
