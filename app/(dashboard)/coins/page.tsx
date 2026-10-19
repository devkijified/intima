'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { COIN_PACKAGES } from '@/lib/coins/packages'
import { Coins, Loader2, Plus, History } from 'lucide-react'
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
      if (live) {
        setBalance(bal?.balance ?? 0)
        setTopups(history ?? [])
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
      <div className="mt-3 grid grid-cols-2 gap-3">
        {COIN_PACKAGES.map((pkg) => (
          <button
            key={pkg.id}
            onClick={() => buy(pkg.id)}
            disabled={buying !== null}
            className="rounded-3xl border border-neutral-200/80 bg-white p-5 text-left shadow-xs transition-all hover:border-gold active:scale-[0.98] disabled:opacity-60"
          >
            <p className="font-display text-2xl font-bold text-charcoal">
              {pkg.coins.toLocaleString()}
            </p>
            <p className="text-xs text-neutral-500">{pkg.label}</p>
            <p className="mt-2 flex items-center justify-between">
              <span className="text-sm font-bold text-primary">₦{pkg.priceNgn.toLocaleString()}</span>
              {buying === pkg.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
              ) : (
                <Plus className="h-4 w-4 text-neutral-300" />
              )}
            </p>
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-neutral-400">
        Secure checkout via Paystack. Coins are non-refundable.
      </p>

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
