'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Wallet, Info, Coins, ArrowRight } from '@/lib/icons'

export default function WalletPage() {
  const [role, setRole] = useState('client')
  const [coinBalance, setCoinBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
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
          {coinBalance === null ? '—' : coinBalance.toLocaleString()}
        </p>
        <p className="mt-1 text-xs text-white/60">
          ≈ ₦{((coinBalance ?? 0) * 10).toLocaleString()} · 1 coin = ₦10 · Tap to buy more
        </p>
      </Link>

      <div className="mt-4 rounded-3xl bg-gradient-to-r from-neutral-800 to-neutral-900 p-6 text-white">
        <p className="text-sm text-white/80">Naira Balance</p>
        <p className="mt-1 text-4xl font-bold">₦0</p>
        <p className="mt-2 text-xs text-white/70">
          {role === 'model'
            ? 'Your earnings from paid live streams will appear here.'
            : 'Connection fees you pay will appear here.'}
        </p>
      </div>

      <div className="mt-6 rounded-3xl border border-neutral-200/80 bg-white p-6">
        <h2 className="font-semibold text-charcoal">Transaction History</h2>
        <div className="mt-4 rounded-2xl bg-cream p-8 text-center">
          <Wallet className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-2 text-sm font-medium text-charcoal">No transactions yet</p>
          <p className="mt-1 flex items-center justify-center gap-1 text-xs text-neutral-500">
            <Info className="h-3 w-3" />
            Coin top-ups appear in <Link href="/coins" className="font-medium text-primary underline">Coins</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
