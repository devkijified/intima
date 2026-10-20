'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { COIN_PACKAGES } from '@/lib/coins/packages'
import { Coins, Loader2, Plus, History } from '@/lib/icons'
import Link from 'next/link'

interface Topup {
  id: string
  coins: number
  amount_ngn: number
  created_at: string
}

/**
 * Coins wallet: balance, packages (Paystack checkout), topup history.
 * 1 coin = ₦10.
 */
export default function CoinsPage() {
  const [balance, setBalance] = useState<number | null>(null)
  const [topups, setTopups] = useState<Topup[]>([])
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cardEnabled, setCardEnabled] = useState(false)

  useEffect(() => {
    // Card checkout is only shown when the server says Paystack is configured.
    fetch('/api/coins/methods')
      .then((r) => (r.ok ? r.json() : { card: false }))
      .then((d) => setCardEnabled(!!d.card))
      .catch(() => setCardEnabled(false))
  }, [])
  const [method, setMethod] = useState<'paystack' | 'transfer'>('transfer')
  const [intent, setIntent] = useState<{
    reference: string; amountNgn: number; coins: number; expiresAt: string
    bank: { name: string; accountNumber: string; accountName: string }
  } | null>(null)
  const [creatingIntent, setCreatingIntent] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: bal } = await supabase
        .from('coin_balances')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle()
      const { data: history } = await supabase
        .from('coin_topups')
        .select('id, coins, amount_ngn, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      const intentRes = await fetch('/api/coins/transfer-intent')
      const intentData = intentRes.ok ? await intentRes.json() : { intent: null }
      if (live) {
        setBalance(bal?.balance ?? 0)
        setTopups(history ?? [])
        setIntent(intentData.intent)
      }
    })()
    return () => { live = false }
  }, [])

  const buy = async (packageId: string) => {
    setBuying(packageId)
    setError(null)
    try {
      const res = await fetch('/api/coins/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start payment')
      window.location.href = data.authorizationUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
      setBuying(null)
    }
  }

  const startTransfer = async (packageId: string) => {
    setCreatingIntent(packageId)
    setError(null)
    try {
      const res = await fetch('/api/coins/transfer-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start transfer')
      setIntent(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transfer failed')
    } finally {
      setCreatingIntent(null)
    }
  }

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6 pb-28 md:pb-10">
      <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-charcoal">
        <Coins className="h-6 w-6 text-gold" /> Coins
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        1 coin = ₦10. Send gifts during live streams.
      </p>

      {/* Balance hero */}
      <div className="mt-5 rounded-3xl bg-gradient-to-br from-primary to-[#7a1a36] p-6 text-white shadow-lg">
        <p className="text-xs font-medium uppercase tracking-widest text-white/70">Your balance</p>
        <p className="mt-1 font-display text-4xl font-bold">
          {balance === null ? '—' : balance.toLocaleString()}
          <span className="ml-2 text-base font-normal text-white/70">coins</span>
        </p>
        <p className="mt-1 text-xs text-white/60">≈ ₦{((balance ?? 0) * 10).toLocaleString()}</p>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Packages */}
      <h2 className="mt-6 text-sm font-bold uppercase tracking-widest text-neutral-400">Buy coins</h2>

      {/* Payment method tabs — card checkout only appears once Paystack is live. */}
      {cardEnabled && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-neutral-100 p-1">
          <button
            onClick={() => setMethod('transfer')}
            className={`rounded-xl py-2.5 text-sm font-semibold transition-all ${method === 'transfer' ? 'bg-white text-charcoal shadow-xs' : 'text-neutral-500'}`}
          >
            Bank transfer
          </button>
          <button
            onClick={() => setMethod('paystack')}
            className={`rounded-xl py-2.5 text-sm font-semibold transition-all ${method === 'paystack' ? 'bg-white text-charcoal shadow-xs' : 'text-neutral-500'}`}
          >
            Card / Paystack
          </button>
        </div>
      )}

      {method === 'transfer' && intent && (
        <div className="mt-3 rounded-3xl border-2 border-gold/60 bg-gold/5 p-5">
          <p className="text-sm font-bold text-charcoal">Transfer ₦{intent.amountNgn.toLocaleString()} to:</p>
          <div className="mt-3 space-y-2">
            {[
              { k: 'bank', label: 'Bank', value: intent.bank.name },
              { k: 'acct', label: 'Account number', value: intent.bank.accountNumber },
              { k: 'name', label: 'Account name', value: intent.bank.accountName },
              { k: 'ref', label: 'Reference (put in narration)', value: intent.reference },
              { k: 'amt', label: 'Amount', value: `₦${intent.amountNgn.toLocaleString()}` },
            ].map((row) => (
              <button
                key={row.k}
                onClick={() => copy(row.value, row.k)}
                className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left active:scale-[0.99]"
              >
                <span>
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-neutral-400">{row.label}</span>
                  <span className={`block font-mono text-sm font-bold ${row.k === 'ref' ? 'text-primary' : 'text-charcoal'}`}>{row.value}</span>
                </span>
                <span className="text-xs font-medium text-neutral-400">{copied === row.k ? 'Copied!' : 'Tap to copy'}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-neutral-500">
            Send exactly ₦{intent.amountNgn.toLocaleString()} with the reference above.
            Coins land automatically once the transfer confirms (usually a few minutes).
          </p>
          <button
            onClick={async () => {
              await fetch('/api/coins/transfer-intent/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: intent.reference }),
              }).catch(() => {})
              setIntent(null)
            }}
            className="mt-2 w-full text-center text-xs font-medium text-neutral-400 underline"
          >
            Cancel this transfer
          </button>
        </div>
      )}

      {!(method === 'transfer' && intent) && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {COIN_PACKAGES.map((pkg) => (
              <button
                key={pkg.id}
                onClick={() => method === 'paystack' ? buy(pkg.id) : startTransfer(pkg.id)}
                disabled={buying !== null || creatingIntent !== null}
                className="rounded-3xl border border-neutral-200/80 bg-white p-5 text-left shadow-xs transition-all hover:border-gold active:scale-[0.98] disabled:opacity-60"
              >
                <p className="font-display text-2xl font-bold text-charcoal">
                  {pkg.coins.toLocaleString()}
                </p>
                <p className="text-xs text-neutral-500">{pkg.label}</p>
                <p className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-primary">₦{pkg.priceNgn.toLocaleString()}</span>
                  {(buying === pkg.id || creatingIntent === pkg.id) ? (
                    <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                  ) : (
                    <Plus className="h-4 w-4 text-neutral-300" />
                  )}
                </p>
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-neutral-400">
            {method === 'paystack'
              ? 'Secure checkout via Paystack. Coins are non-refundable.'
              : 'No KYC, no card needed. Transfer from any Nigerian bank app.'}
          </p>
        </>
      )}

      {/* History */}
      {topups.length > 0 && (
        <>
          <h2 className="mt-6 flex items-center gap-1.5 text-sm font-bold uppercase tracking-widest text-neutral-400">
            <History className="h-4 w-4" /> History
          </h2>
          <div className="mt-3 divide-y divide-neutral-100 rounded-3xl border border-neutral-200/70 bg-white">
            {topups.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-charcoal">+{t.coins.toLocaleString()} coins</p>
                  <p className="text-xs text-neutral-400">
                    {new Date(t.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <p className="text-sm font-medium text-neutral-600">₦{t.amount_ngn.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <Link
        href="/live"
        className="mt-6 block rounded-full bg-charcoal py-3 text-center text-sm font-bold text-white"
      >
        Watch live & send gifts
      </Link>
    </div>
  )
}
