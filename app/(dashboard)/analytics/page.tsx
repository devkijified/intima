'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ngnForCoins } from '@/lib/utils/helpers'
import { Calendar, Coins, Eye, Heart, Star, Users } from '@/lib/icons'

interface PeriodStats {
  connectionsTotal: number
  connectionsByStatus: Record<string, number>
  giftCoins: number
  reviewCount: number
  reviewAvg: number | null
  favoritesNew: number
  followersNew: number
  profileViews: number
}

const EMPTY_PERIOD: PeriodStats = {
  connectionsTotal: 0,
  connectionsByStatus: {},
  giftCoins: 0,
  reviewCount: 0,
  reviewAvg: null,
  favoritesNew: 0,
  followersNew: 0,
  profileViews: 0,
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  pending_payment: 'Waiting for payment',
  refunded: 'Refunded',
  expired: 'Expired',
}

function deltaText(current: number, previous: number): { text: string; cls: string } {
  if (previous === 0 && current === 0) {
    return { text: 'No change', cls: 'border-neutral-200 bg-neutral-50 text-neutral-500' }
  }
  if (previous === 0) {
    return { text: `Up from 0 last period`, cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
  }
  const diff = current - previous
  const pct = Math.round((diff / previous) * 100)
  if (diff === 0) {
    return { text: 'No change', cls: 'border-neutral-200 bg-neutral-50 text-neutral-500' }
  }
  const arrow = diff > 0 ? '↑' : '↓'
  const signed = diff > 0 ? `+${diff}` : `${diff}`
  return {
    text: `${arrow} ${Math.abs(pct)}% (${signed})`,
    cls: diff > 0
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-red-200 bg-red-50 text-red-600',
  }
}

function DeltaChip({ current, previous }: { current: number; previous: number }) {
  const d = deltaText(current, previous)
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${d.cls}`}>
      {d.text}
    </span>
  )
}

function MetricCard({
  title,
  icon: Icon,
  current,
  previous,
  children,
}: {
  title: string
  icon: typeof Eye
  current: React.ReactNode
  previous: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-400">{title}</h2>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-muted">
          <Icon className="h-4 w-4 text-primary" />
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Last 30 days</p>
          <div className="mt-1 font-display text-2xl font-semibold text-charcoal">{current}</div>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Previous 30 days</p>
          <div className="mt-1 font-display text-2xl font-semibold text-neutral-400">{previous}</div>
        </div>
      </div>
      {children}
    </div>
  )
}

/**
 * Provider analytics: how the last 30 days compare with the 30 days
 * before that, across connections, gifts, reviews, saves, followers
 * and profile views. Everything is read live from the real tables.
 */
export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState<PeriodStats>(EMPTY_PERIOD)
  const [previous, setPrevious] = useState<PeriodStats>(EMPTY_PERIOD)
  const [favoritesTotal, setFavoritesTotal] = useState(0)
  const [followersTotal, setFollowersTotal] = useState(0)
  const [viewsTotal, setViewsTotal] = useState(0)
  const [viewsEarliest, setViewsEarliest] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const now = Date.now()
      const dayMs = 24 * 60 * 60 * 1000
      const currentStart = new Date(now - 30 * dayMs)
      const previousStart = new Date(now - 60 * dayMs)
      const inCurrent = (iso: string) => new Date(iso).getTime() >= currentStart.getTime()
      const since = previousStart.toISOString()

      const [connRes, giftRes, reviewRes, favRowsRes, favTotalRes, followRowsRes, followTotalRes, viewRowsRes, viewTotalRes, viewEarliestRes] = await Promise.all([
        supabase.from('connections').select('status, created_at').eq('provider_id', user.id).gte('created_at', since),
        supabase.from('gift_transactions').select('host_earnings_coins, created_at').eq('host_id', user.id).gte('created_at', since),
        supabase.from('reviews').select('rating, created_at').eq('reviewee_id', user.id).eq('status', 'published').gte('created_at', since),
        supabase.from('favorites').select('created_at').eq('provider_id', user.id).gte('created_at', since),
        supabase.from('favorites').select('id', { count: 'exact', head: true }).eq('provider_id', user.id),
        supabase.from('broadcast_follows').select('created_at').eq('provider_id', user.id).gte('created_at', since),
        supabase.from('broadcast_follows').select('provider_id', { count: 'exact', head: true }).eq('provider_id', user.id),
        supabase.from('profile_events').select('created_at').eq('provider_id', user.id).gte('created_at', since),
        supabase.from('profile_events').select('id', { count: 'exact', head: true }).eq('provider_id', user.id),
        supabase.from('profile_events').select('created_at').eq('provider_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle(),
      ])
      if (!live) return

      const cur: PeriodStats = { ...EMPTY_PERIOD, connectionsByStatus: {}, reviewAvg: null }
      const prev: PeriodStats = { ...EMPTY_PERIOD, connectionsByStatus: {}, reviewAvg: null }
      const curRatings: number[] = []
      const prevRatings: number[] = []

      for (const row of (connRes.data ?? []) as { status: string; created_at: string }[]) {
        const bucket = inCurrent(row.created_at) ? cur : prev
        bucket.connectionsTotal += 1
        if (bucket === cur) {
          bucket.connectionsByStatus[row.status] = (bucket.connectionsByStatus[row.status] ?? 0) + 1
        }
      }
      for (const row of (giftRes.data ?? []) as { host_earnings_coins: number; created_at: string }[]) {
        const bucket = inCurrent(row.created_at) ? cur : prev
        bucket.giftCoins += row.host_earnings_coins ?? 0
      }
      for (const row of (reviewRes.data ?? []) as { rating: number; created_at: string }[]) {
        if (inCurrent(row.created_at)) { cur.reviewCount += 1; curRatings.push(row.rating) }
        else { prev.reviewCount += 1; prevRatings.push(row.rating) }
      }
      cur.reviewAvg = curRatings.length > 0 ? curRatings.reduce((a, b) => a + b, 0) / curRatings.length : null
      prev.reviewAvg = prevRatings.length > 0 ? prevRatings.reduce((a, b) => a + b, 0) / prevRatings.length : null

      for (const row of (favRowsRes.data ?? []) as { created_at: string }[]) {
        if (inCurrent(row.created_at)) cur.favoritesNew += 1; else prev.favoritesNew += 1
      }
      for (const row of (followRowsRes.data ?? []) as { created_at: string }[]) {
        if (inCurrent(row.created_at)) cur.followersNew += 1; else prev.followersNew += 1
      }
      for (const row of (viewRowsRes.data ?? []) as { created_at: string }[]) {
        if (inCurrent(row.created_at)) cur.profileViews += 1; else prev.profileViews += 1
      }

      setCurrent(cur)
      setPrevious(prev)
      setFavoritesTotal(favTotalRes.count ?? 0)
      setFollowersTotal(followTotalRes.count ?? 0)
      setViewsTotal(viewTotalRes.count ?? 0)
      setViewsEarliest((viewEarliestRes.data as { created_at: string } | null)?.created_at ?? null)
      setLoading(false)
    })()
    return () => { live = false }
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 pb-28 md:pb-10">
        <div className="h-8 w-48 animate-pulse rounded-full bg-neutral-100" />
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-3xl bg-neutral-100" />
          ))}
        </div>
      </div>
    )
  }

  const earliestMs = viewsEarliest ? new Date(viewsEarliest).getTime() : null
  const viewsTrackingIsNew =
    viewsTotal < 20 || earliestMs === null || (Date.now() - earliestMs) < 14 * 24 * 60 * 60 * 1000

  const statusOrder = ['active', 'pending_payment', 'refunded', 'expired']

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-28 md:pb-10">
      <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-charcoal">
        <Eye className="h-6 w-6 text-gold" /> Analytics
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        How your last 30 days compare with the 30 days before that.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard
          title="Connections"
          icon={Calendar}
          current={current.connectionsTotal.toLocaleString()}
          previous={previous.connectionsTotal.toLocaleString()}
        >
          <div className="mt-3 flex items-center justify-between gap-2">
            <DeltaChip current={current.connectionsTotal} previous={previous.connectionsTotal} />
          </div>
          <div className="mt-3 space-y-1 border-t border-neutral-100 pt-3">
            {statusOrder.map((status) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">{STATUS_LABELS[status] ?? status}</span>
                <span className="font-semibold text-charcoal">{current.connectionsByStatus[status] ?? 0}</span>
              </div>
            ))}
            <p className="pt-1 text-xs text-neutral-400">Breakdown is for the last 30 days.</p>
          </div>
        </MetricCard>

        <MetricCard
          title="Gift earnings"
          icon={Coins}
          current={`${current.giftCoins.toLocaleString()} coins`}
          previous={`${previous.giftCoins.toLocaleString()} coins`}
        >
          <div className="mt-3 flex items-center justify-between gap-2">
            <DeltaChip current={current.giftCoins} previous={previous.giftCoins} />
            <span className="text-xs text-neutral-400">About {ngnForCoins(current.giftCoins)}</span>
          </div>
        </MetricCard>

        <MetricCard
          title="Reviews"
          icon={Star}
          current={current.reviewCount > 0 ? `${(current.reviewAvg ?? 0).toFixed(1)} (${current.reviewCount})` : 'No reviews yet'}
          previous={previous.reviewCount > 0 ? `${(previous.reviewAvg ?? 0).toFixed(1)} (${previous.reviewCount})` : 'None'}
        >
          <div className="mt-3 flex items-center justify-between gap-2">
            <DeltaChip current={current.reviewCount} previous={previous.reviewCount} />
            <span className="text-xs text-neutral-400">Average rating and count, published only</span>
          </div>
        </MetricCard>

        <MetricCard
          title="Profile views"
          icon={Eye}
          current={current.profileViews.toLocaleString()}
          previous={previous.profileViews.toLocaleString()}
        >
          <div className="mt-3 flex items-center justify-between gap-2">
            <DeltaChip current={current.profileViews} previous={previous.profileViews} />
            <span className="text-xs text-neutral-400">{viewsTotal.toLocaleString()} all time</span>
          </div>
          {viewsTrackingIsNew && (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              View tracking started recently, so view numbers grow from today.
            </p>
          )}
        </MetricCard>

        <MetricCard
          title="Saved by clients"
          icon={Heart}
          current={`${current.favoritesNew.toLocaleString()} new`}
          previous={`${previous.favoritesNew.toLocaleString()} new`}
        >
          <div className="mt-3 flex items-center justify-between gap-2">
            <DeltaChip current={current.favoritesNew} previous={previous.favoritesNew} />
            <span className="text-xs text-neutral-400">{favoritesTotal.toLocaleString()} clients have you saved in total</span>
          </div>
        </MetricCard>

        <MetricCard
          title="Followers"
          icon={Users}
          current={`${current.followersNew.toLocaleString()} new`}
          previous={`${previous.followersNew.toLocaleString()} new`}
        >
          <div className="mt-3 flex items-center justify-between gap-2">
            <DeltaChip current={current.followersNew} previous={previous.followersNew} />
            <span className="text-xs text-neutral-400">{followersTotal.toLocaleString()} followers in total</span>
          </div>
        </MetricCard>
      </div>
    </div>
  )
}
