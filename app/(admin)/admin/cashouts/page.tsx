'use client'

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, Banknote, XCircle } from '@/lib/icons'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface CashoutRequest {
  id: string
  coins: number
  amount_ngn: number
  bank_name: string
  account_number: string
  account_name: string
  status: string
  created_at: string
  user_id: string
  profiles: { display_name: string }
}

/**
 * Admin: review companion cash-out requests.
 * Flow: pending → approve (verify bank details) → pay (after bank transfer) → paid.
 * Reject refunds the held coins.
 */
export default function AdminCashoutsPage() {
  const [tab, setTab] = useState<'pending' | 'approved' | 'paid' | 'rejected'>('pending')
  const [requests, setRequests] = useState<CashoutRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [pendingAct, setPendingAct] = useState<{ id: string; action: 'approve' | 'pay' | 'reject' } | null>(null)

  const load = async (status: string) => {
    setLoading(true)
    const res = await fetch(`/api/admin/cashouts?status=${status}`)
    const data = await res.json()
    setRequests(data.requests ?? [])
    setLoading(false)
  }

  useEffect(() => { load(tab) }, [tab])

  const act = (id: string, action: 'approve' | 'pay' | 'reject') => {
    setPendingAct({ id, action })
  }

  const doAct = async (id: string, action: 'approve' | 'pay' | 'reject') => {
    setPendingAct(null)
    setActing(id)
    await fetch('/api/admin/cashouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    setActing(null)
    await load(tab)
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900">Cash-out requests</h1>
      <p className="mt-1 text-sm text-gray-500">
        Companions cash out gift coins at ₦10/coin. You transfer manually from your bank, then mark paid.
      </p>

      <div className="scroll-row mt-4 gap-2 pb-1">
        {(['pending', 'approved', 'paid', 'rejected'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium capitalize ${
              tab === s ? 'bg-[#AC244D] text-white' : 'bg-white text-gray-600 border'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-6 text-gray-500"><Loader2 aria-hidden className="inline h-4 w-4 animate-spin" /> Loading…</p>
      ) : requests.length === 0 ? (
        <p className="mt-6 text-gray-500">No {tab} requests.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-2xl border bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-900">{r.profiles?.display_name ?? r.user_id.slice(0, 8)}</p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {r.coins.toLocaleString()} coins → <span className="font-bold text-gray-900">₦{r.amount_ngn.toLocaleString()}</span>
                  </p>
                  <div className="mt-2 rounded-xl bg-gray-50 p-3 text-sm">
                    <p><span className="text-gray-400">Bank:</span> {r.bank_name}</p>
                    <p><span className="text-gray-400">Account:</span> {r.account_number}</p>
                    <p><span className="text-gray-400">Name:</span> {r.account_name}</p>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  {r.status === 'pending' && (
                    <>
                      <button
                        onClick={() => act(r.id, 'approve')}
                        disabled={acting === r.id}
                        className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      >
                        <CheckCircle2 aria-hidden className="h-4 w-4" /> Approve
                      </button>
                      <button
                        onClick={() => act(r.id, 'reject')}
                        disabled={acting === r.id}
                        className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-60"
                      >
                        <XCircle aria-hidden className="h-4 w-4" /> Reject
                      </button>
                    </>
                  )}
                  {r.status === 'approved' && (
                    <button
                      onClick={() => act(r.id, 'pay')}
                      disabled={acting === r.id}
                      className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      <Banknote aria-hidden className="h-4 w-4" /> Mark paid
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={pendingAct !== null}
        title={
          pendingAct?.action === 'approve'
            ? 'Approve this cash-out?'
            : pendingAct?.action === 'pay'
              ? 'Mark this cash-out as paid?'
              : 'Reject this cash-out?'
        }
        body={
          pendingAct?.action === 'pay'
            ? 'Only confirm after the bank transfer has actually left the platform account.'
            : pendingAct?.action === 'reject'
              ? 'The held coins go back to the companion in full.'
              : 'The companion will see the request as approved, ready for payment.'
        }
        confirmLabel={
          pendingAct?.action === 'approve'
            ? 'Approve'
            : pendingAct?.action === 'pay'
              ? 'Mark paid'
              : 'Reject'
        }
        busy={acting !== null}
        onCancel={() => setPendingAct(null)}
        onConfirm={() => { if (pendingAct) void doAct(pendingAct.id, pendingAct.action) }}
      />
    </div>
  )
}
