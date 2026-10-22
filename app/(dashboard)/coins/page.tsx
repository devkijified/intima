'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { COIN_PACKAGES } from '@/lib/coins/packages'
import { Coins, Loader2, Plus, History } from '@/lib/icons'
import { coinsWithNgn, ngnForCoins } from '@/lib/utils/helpers'
import { HelpTip } from '@/components/ui/Tooltip'
import { ReferralCard } from '@/components/referrals/ReferralCard'
import { PullToRefresh } from '@/components/shared/PullToRefresh'
import { DedicatedAccountCard } from '@/components/coins/DedicatedAccountCard'
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
  const [loading, setLoading] = useState(true)
  const [referralCoins, setReferralCoins] = useState(0)
  const [referralCount, setReferralCount] = useState(0)
  const [topups, setTopups] = useState<Topup[]>([])
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [methods, setMethods] = useState<{ card: boolean; transfer: boolean }>({ card: false, transfer: false })

  useEffect(() => {
    // Card and bank transfer checkout appear only once Paystack is live.
    fetch('/api/coins/methods')
      .then((r) => (r.ok ? r.json() : { card: false, transfer: false }))
      .then((d) => {
        const m = { card: !!d.card, transfer: !!d.transfer }
        setMethods(m)
        if (!m.transfer) setMethod('crypto')
      })
      .catch(() => setMethods({ card: false, transfer: false }))
  }, [])
  const [method, setMethod] = useState<'paystack' | 'transfer' | 'crypto'>('transfer')
  const [cryptoBusy, setCryptoBusy] = useState<string | null>(null)
  const [cryptoNotice, setCryptoNotice] = useState('')

  const loadCoins = async () => {
    {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }
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
      const { data: rewards } = await supabase
        .from('referral_rewards')
        .select('coins')
        .eq('referrer_id', user.id)
        .eq('reward_kind', 'coins')
      setBalance(bal?.balance ?? 0)
      setTopups(history ?? [])
      setReferralCount(rewards?.length ?? 0)
      setReferralCoins((rewards ?? []).reduce((s, r) => s + (r.coins ?? 0), 0))
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCoins()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const buy = async (packageId: string, channel?: 'bank_transfer') => {
    setBuying(packageId)
    setError(null)
    try {
      const res = await fetch('/api/coins/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channel ? { packageId, channel } : { packageId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start payment')
      window.location.href = data.authorizationUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
      setBuying(null)
    }
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('crypto') === 'success') {
      setCryptoNotice('Payment sent. Your coins land automatically once the network confirms, usually a few minutes.')
    } else if (q.get('crypto') === 'cancelled') {
      setCryptoNotice('Crypto payment cancelled. No charge was made.')
    }
  }, [])

  const startCrypto = async (packageId: string) => {
    setCryptoBusy(packageId)
    setError('')
    try {
      const res = await fetch('/api/payments/crypto/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'coins', package_id: packageId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.invoiceUrl) {
        throw new Error(data?.error || 'Could not start crypto checkout')
      }
      window.location.href = data.invoiceUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start crypto checkout')
      setCryptoBusy(null)
    }
  }

  return (
    <PullToRefresh onRefresh={loadCoins} className="mx-auto max-w-xl px-4 py-6 pb-28 md:pb-10">
      <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-charcoal">
        <Coins className="h-6 w-6 text-gold" aria-hidden /> Coins
        <HelpTip text="1 coin = ₦10. Coins pay for gifts on live streams, boosts, and fan club memberships. Coins are not refundable, so buy only what you plan to spend." />
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        1 coin = ₦10. Send gifts during live streams.
      </p>

      {/* Balance hero */}
      <div className="mt-5 rounded-3xl bg-gradient-to-br from-primary to-[#7a1a36] p-6 text-white shadow-lg">
        <p className="text-xs font-medium uppercase tracking-widest text-white/70">Your balance</p>
        <p className="mt-1 font-display text-4xl font-bold">
          {balance === null ? '…' : balance.toLocaleString()}
          <span className="ml-2 text-base font-normal text-white/70">coins</span>
        </p>
        <p className="mt-1 text-xs text-white/60">≈ {ngnForCoins(balance ?? 0)}</p>
      </div>

      <DedicatedAccountCard />

      {error && (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Referral rewards */}
      <div className="mt-4 rounded-3xl border border-neutral-200/70 bg-white px-5 py-4">
        <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-widest text-neutral-400">
          Referral rewards
          <HelpTip text="Share your link. When a friend joins through it and opens their first paid connection, you earn: 500 coins as a companion, 100 coins as a client." />
        </p>
        {loading ? (
          <div className="mt-2 space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-neutral-100" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-neutral-100" />
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-charcoal">
              <span className="font-bold">{coinsWithNgn(referralCoins)}</span> earned from{' '}
              {referralCount} friend{referralCount === 1 ? '' : 's'} who joined and connected.
            </p>
            <p className="mt-0.5 text-xs text-neutral-400">
              Share your link. When a friend you brought opens their first connection, your reward lands here.
            </p>
            <div className="mt-4 border-t border-neutral-100 pt-4">
              <ReferralCard />
            </div>
          </>
        )}
      </div>

      {/* Packages */}
      <h2 className="mt-6 text-sm font-bold uppercase tracking-widest text-neutral-400">Buy coins</h2>

      {/* Payment method tabs: card and transfer checkout appear once Paystack is live. */}
      <div className={`mt-3 grid gap-2 rounded-2xl bg-neutral-100 p-1 ${methods.card && methods.transfer ? 'grid-cols-3' : methods.card || methods.transfer ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {methods.transfer && (
          <button
            onClick={() => setMethod('transfer')}
            aria-pressed={method === 'transfer'}
            className={`flex min-h-[44px] items-center justify-center rounded-xl py-2.5 text-sm font-semibold transition-all ${method === 'transfer' ? 'bg-white text-charcoal shadow-xs' : 'text-neutral-500'}`}
          >
            Bank transfer
          </button>
        )}
        <button
          onClick={() => setMethod('crypto')}
          aria-pressed={method === 'crypto'}
          className={`flex min-h-[44px] items-center justify-center rounded-xl py-2.5 text-sm font-semibold transition-all ${method === 'crypto' ? 'bg-white text-charcoal shadow-xs' : 'text-neutral-500'}`}
        >
          Crypto (USDT)
        </button>
        {methods.card && (
          <button
            onClick={() => setMethod('paystack')}
            aria-pressed={method === 'paystack'}
            className={`flex min-h-[44px] items-center justify-center rounded-xl py-2.5 text-sm font-semibold transition-all ${method === 'paystack' ? 'bg-white text-charcoal shadow-xs' : 'text-neutral-500'}`}
          >
            Card / Paystack
          </button>
        )}
      </div>

      {cryptoNotice && (
        <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{cryptoNotice}</p>
      )}

      <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {COIN_PACKAGES.map((pkg) => (
              <button
                key={pkg.id}
                onClick={() => method === 'paystack' ? buy(pkg.id) : method === 'crypto' ? startCrypto(pkg.id) : buy(pkg.id, 'bank_transfer')}
                disabled={buying !== null || cryptoBusy !== null}
                className="rounded-3xl border border-neutral-200/80 bg-white p-5 text-left shadow-xs transition-all hover:border-gold active:scale-[0.98] disabled:opacity-60"
              >
                <p className="font-display text-2xl font-bold text-charcoal">
                  {pkg.coins.toLocaleString()}
                </p>
                <p className="text-xs text-neutral-500">{pkg.label}</p>
                <p className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-primary">₦{pkg.priceNgn.toLocaleString()}</span>
                  {(buying === pkg.id || cryptoBusy === pkg.id) ? (
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
              : method === 'crypto'
                ? 'Pay with USDT or other crypto. Coins land automatically once the network confirms.'
                : 'Paystack creates an account number for this payment only. Transfer the exact amount from any bank app and your coins land automatically once it confirms. You can close the page after transferring.'}
          </p>
      </>

      {/* History: skeleton while the first fetch resolves, so the
          section never pops in from nothing or flashes empty. */}
      {loading && (
        <div className="mt-6 space-y-2" aria-hidden="true">
          <div className="h-4 w-24 animate-pulse rounded-full bg-neutral-100" />
          <div className="h-14 animate-pulse rounded-3xl bg-neutral-100" />
          <div className="h-14 animate-pulse rounded-3xl bg-neutral-100" />
        </div>
      )}
      {!loading && topups.length > 0 && (
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
        className="mt-6 flex min-h-[48px] items-center justify-center rounded-full bg-charcoal py-3 text-center text-sm font-bold text-white"
      >
        Watch live & send gifts
      </Link>
    </PullToRefresh>
  )
}
