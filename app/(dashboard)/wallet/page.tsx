'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Wallet, Info, Coins, ArrowRight } from '@/lib/icons'

export default function WalletPage() {
  const [role, setRole] = useState('client')
  const [coinBalance, setCoinBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: profile } = await supabase.from('profiles')
        .select('role').eq('id', user.id).maybeSingle()
      setRole(profile?.role ?? 'client')
      const { data: bal } = await supabase.from('coin_balances')
        .select('balance').eq('user_id', user.id).maybeSingle()
      setCoinBalance(bal?.balance ?? 0)
      const { data: topups } = await supabase.from('coin_topups')
        .select('reference, coins, amount_ngn, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      const { data: conns } = await supabase.from('connections')
        .select('fee_ngn, created_at, provider_id')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      // Provider names are fetched separately (the bookings page
      // pattern): there is no connections to profiles foreign key
      // for PostgREST to embed, and the embedded select used to
      // fail with a 400, silently dropping every fee row.
      const providerIds = [...new Set(((conns ?? []) as any[]).map((c) => c.provider_id).filter(Boolean))]
      const nameById = new Map<string, string>()
      if (providerIds.length > 0) {
        const { data: profs } = await supabase.from('profiles')
          .select('id, display_name')
          .in('id', providerIds)
        ;(profs ?? []).forEach((p: any) => nameById.set(p.id, p.display_name ?? 'companion'))
      }
      const txs = [
        ...((topups ?? []) as any[]).map((t) => ({
          id: `top-${t.reference}`,
          label: `+${t.coins.toLocaleString()} coins`,
          sub: t.reference.startsWith('transfer-') ? 'Bank transfer top-up' : 'Card top-up',
          amount: `₦${t.amount_ngn.toLocaleString()}`,
          date: t.created_at,
        })),
        ...((conns ?? []) as any[]).map((c) => ({
          id: `conn-${c.created_at}`,
          label: `Connection fee: ${nameById.get(c.provider_id) ?? 'companion'}`,
          sub: 'Unlocked chat, calls, WhatsApp',
          amount: `-₦${c.fee_ngn.toLocaleString()}`,
          date: c.created_at,
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setTransactions(txs.slice(0, 20))
      setLoading(false)
    }
    load()
  }, [supabase])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 md:pb-10">
      <h1 className="font-display text-2xl font-semibold text-charcoal">Wallet</h1>

      {/* Coins section */}
      <Link href="/coins" className="mt-6 block rounded-3xl bg-gradient-to-br from-primary to-[#7a1a36] p-6 text-white shadow-lg transition-transform active:scale-[0.99]">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-medium text-white/80">
            <Coins className="h-4 w-4 text-gold" /> Coins
          </p>
          <ArrowRight className="h-4 w-4 text-white/60" />
        </div>
        <p className="mt-2 font-display text-4xl font-bold">
          {coinBalance === null ? '…' : coinBalance.toLocaleString()}
        </p>
        <p className="mt-1 text-xs text-white/60">
          ≈ ₦{((coinBalance ?? 0) * 10).toLocaleString()} · 1 coin = ₦10 · Tap to buy more
        </p>
      </Link>


      <div className="mt-6 rounded-3xl border border-neutral-200/80 bg-white p-6">
        <h2 className="font-semibold text-charcoal">Transaction History</h2>
        {transactions.length > 0 ? (
          <div className="mt-3 divide-y divide-neutral-100">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-charcoal">{t.label}</p>
                  <p className="text-xs text-neutral-500">{t.sub} · {new Date(t.date).toLocaleDateString()}</p>
                </div>
                <span className="shrink-0 text-sm font-bold text-charcoal">{t.amount}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl bg-cream p-8 text-center">
            <Wallet className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-2 text-sm font-medium text-charcoal">No transactions yet</p>
            <p className="mt-1 flex items-center justify-center gap-1 text-xs text-neutral-500">
              <Info className="h-3 w-3" />
              Coin top-ups appear in <Link href="/coins" className="font-medium text-primary underline">Coins</Link>.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
