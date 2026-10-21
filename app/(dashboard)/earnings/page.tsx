'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { coinsWithNgn, ngnForCoins } from '@/lib/utils/helpers'
import { Coins, Loader2, Banknote, Clock, CheckCircle2, XCircle } from '@/lib/icons'
import { HelpTip } from '@/components/ui/Tooltip'
import { PullToRefresh } from '@/components/shared/PullToRefresh'


interface CashoutRequest {
  id: string
  coins: number
  amount_ngn: number
  status: string
  created_at: string
}

const STATUS_META: Record<string, { label: string; icon: typeof Clock; cls: string }> = {
  pending: { label: 'Pending review', icon: Clock, cls: 'text-amber-600 bg-amber-50 border-amber-200' },
  approved: { label: 'Approved: transfer coming', icon: CheckCircle2, cls: 'text-blue-600 bg-blue-50 border-blue-200' },
  paid: { label: 'Paid', icon: Banknote, cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  rejected: { label: 'Rejected: coins refunded', icon: XCircle, cls: 'text-red-500 bg-red-50 border-red-200' },
}

/**
 * Companion earnings: gift-coin balance, lifetime earnings, cash-out to bank.
 * 1 coin = ₦10.
 */
export default function EarningsPage() {
  const [balance, setBalance] = useState<number | null>(null)
  const [lifetime, setLifetime] = useState<number | null>(null)
  const [requests, setRequests] = useState<CashoutRequest[]>([])
  const [minCoins, setMinCoins] = useState(500)

  const [coins, setCoins] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const refresh = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: bal } = await supabase.from('coin_balances')
      .select('balance').eq('user_id', user.id).maybeSingle()
    const { data: txs } = await supabase.from('gift_transactions')
      .select('host_earnings_coins').eq('host_id', user.id)
    const { data: setting } = await supabase.from('platform_settings')
      .select('value').eq('key', 'cashout_min_coins').maybeSingle()
    const res = await fetch('/api/cashout/request')
    const hist = res.ok ? await res.json() : { requests: [] }
    setBalance(bal?.balance ?? 0)
    setLifetime((txs ?? []).reduce((s, t) => s + (t.host_earnings_coins ?? 0), 0))
    setMinCoins(Number(setting?.value ?? 500))
    setRequests(hist.requests ?? [])
  }

  useEffect(() => { refresh() }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setDone(false)
    try {
      const res = await fetch('/api/cashout/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coins: Number(coins),
          bankName, accountNumber, accountName,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setDone(true)
      setCoins(''); setBankName(''); setAccountNumber(''); setAccountName('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setSubmitting(false)
    }
  }

  const coinValue = Number(coins) || 0

  return (
    <PullToRefresh onRefresh={refresh} className="mx-auto max-w-xl px-4 py-6 pb-28 md:pb-10">
      <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-charcoal">
        <Banknote className="h-6 w-6 text-gold" /> Earnings
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Gifts you receive convert to coins. Cash out to your bank anytime.
      </p>

      {/* Balance hero */}
      <div className="mt-5 rounded-3xl bg-gradient-to-br from-primary to-[#7a1a36] p-6 text-white shadow-lg">
        <p className="text-xs font-medium uppercase tracking-widest text-white/70">Available to cash out</p>
        <p className="mt-1 font-display text-4xl font-bold">
          {balance === null ? '…' : balance.toLocaleString()}
          <span className="ml-2 text-base font-normal text-white/70">coins</span>
        </p>
        <p className="mt-1 text-xs text-white/60">
          ≈ {ngnForCoins(balance ?? 0)} · Lifetime earned: {lifetime === null ? '…' : coinsWithNgn(lifetime)}
        </p>
      </div>

      {/* Cash-out form */}
      <form onSubmit={submit} className="mt-5 rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
        <h2 className="flex items-center gap-1 text-sm font-bold uppercase tracking-widest text-neutral-400">
          Cash out
          <HelpTip text={`You can cash out from ${coinsWithNgn(minCoins)}. Each coin pays ₦10 into your bank account. Transfers are manual: we review your request and send the money within 48 hours.`} />
        </h2>

        {done && (
          <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Request received. We'll review and transfer within 48 hours.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-neutral-500">Coins (min {minCoins.toLocaleString()} · {ngnForCoins(minCoins)})</span>
          <input
            type="number" min={minCoins} value={coins} onChange={(e) => setCoins(e.target.value)}
            required
            className="mt-1 w-full rounded-2xl border border-neutral-200 px-4 py-3 text-base outline-none focus:border-primary"
            placeholder={String(minCoins)}
          />
          {coinValue > 0 && (
            <span className="mt-1 block text-xs text-neutral-400">≈ {ngnForCoins(coinValue)}</span>
          )}
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-semibold text-neutral-500">Bank name</span>
          <input
            value={bankName} onChange={(e) => setBankName(e.target.value)} required
            className="mt-1 w-full rounded-2xl border border-neutral-200 px-4 py-3 text-base outline-none focus:border-primary"
            placeholder="GTBank"
          />
        </label>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-neutral-500">Account number</span>
            <input
              inputMode="numeric" maxLength={10} value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))} required
              className="mt-1 w-full rounded-2xl border border-neutral-200 px-4 py-3 text-base outline-none focus:border-primary"
              placeholder="0123456789"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-neutral-500">Account name</span>
            <input
              value={accountName} onChange={(e) => setAccountName(e.target.value)} required
              className="mt-1 w-full rounded-2xl border border-neutral-200 px-4 py-3 text-base outline-none focus:border-primary"
              placeholder="Adaeze Okafor"
            />
          </label>
        </div>

        <button
          type="submit" disabled={submitting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
          Request cash-out
        </button>
        <p className="mt-2 text-center text-xs text-neutral-400">
          Coins are held when you request. Refunded in full if rejected.
        </p>
      </form>

      {/* History */}
      {requests.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-bold uppercase tracking-widest text-neutral-400">Requests</h2>
          <div className="mt-3 divide-y divide-neutral-100 rounded-3xl border border-neutral-200/70 bg-white">
            {requests.map((r) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.pending
              const Icon = meta.icon
              return (
                <div key={r.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-charcoal">
                      {r.coins.toLocaleString()} coins → ₦{r.amount_ngn.toLocaleString()}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {new Date(r.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${meta.cls}`}>
                    <Icon className="h-3 w-3" /> {meta.label}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </PullToRefresh>
  )
}
