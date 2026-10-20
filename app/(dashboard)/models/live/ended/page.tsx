'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, Gift, Clock, Coins, Loader2 } from '@/lib/icons'

interface Summary {
  title: string
  started_at: string
  ended_at: string | null
  giftCount: number
  giftEarnings: number
}

export default function StreamEndedPage() {
  const params = useSearchParams()
  const id = params.get('id')
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    if (!id) return
    let live = true
    ;(async () => {
      const supabase = createClient()
      const { data: s } = await supabase
        .from('live_sessions')
        .select('title, started_at, ended_at')
        .eq('id', id)
        .single()
      const { data: gifts } = await supabase
        .from('gift_transactions')
        .select('host_earnings_coins')
        .eq('session_id', id)
      if (live && s) {
        const earnings = (gifts ?? []).reduce((n, g) => n + (g.host_earnings_coins ?? 0), 0)
        setSummary({
          title: s.title,
          started_at: s.started_at,
          ended_at: s.ended_at,
          giftCount: (gifts ?? []).length,
          giftEarnings: earnings,
        })
      }
    })()
    return () => { live = false }
  }, [id])

  const minutes =
    summary && summary.ended_at
      ? Math.max(1, Math.round((new Date(summary.ended_at).getTime() - new Date(summary.started_at).getTime()) / 60000))
      : null

  return (
    <div className="mx-auto max-w-xl px-4 py-10 pb-28 md:pb-10">
      <div className="rounded-3xl border border-neutral-200/80 bg-white p-8 text-center shadow-sm">
        {!summary ? (
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-neutral-300" />
        ) : (
          <>
            <p className="text-sm font-semibold uppercase tracking-widest text-neutral-400">Stream ended</p>
            <h1 className="mt-2 font-display text-2xl font-semibold text-charcoal">{summary.title}</h1>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-cream p-4">
                <Clock className="mx-auto h-5 w-5 text-neutral-400" />
                <p className="mt-1 text-lg font-bold text-charcoal">{minutes ?? '…'}</p>
                <p className="text-xs text-neutral-500">minutes</p>
              </div>
              <div className="rounded-2xl bg-cream p-4">
                <Gift className="mx-auto h-5 w-5 text-gold" />
                <p className="mt-1 text-lg font-bold text-charcoal">{summary.giftCount}</p>
                <p className="text-xs text-neutral-500">gifts</p>
              </div>
              <div className="rounded-2xl bg-cream p-4">
                <Coins className="mx-auto h-5 w-5 text-primary" />
                <p className="mt-1 text-lg font-bold text-charcoal">{summary.giftEarnings.toLocaleString()}</p>
                <p className="text-xs text-neutral-500">coins earned</p>
              </div>
            </div>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-neutral-400">
              <Eye className="h-3.5 w-3.5" /> ≈ ₦{(summary.giftEarnings * 10).toLocaleString()} at ₦10 per coin
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/models/live" className="flex-1 rounded-full bg-primary py-3 text-sm font-bold text-white">
                Go live again
              </Link>
              <Link href="/dashboard" className="flex-1 rounded-full border border-neutral-200 py-3 text-sm font-semibold text-charcoal">
                Dashboard
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
