'use client'

import { useCallback, useEffect, useState } from 'react'
import { isAdmin } from '@/lib/admin/isAdmin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Star,
  CheckCircle2,
} from '@/lib/icons'

type RangeKey = '24h' | '7d' | '30d' | 'all'
const RANGES: { key: RangeKey; label: string }[] = [
  { key: '24h', label: '24 hours' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
]

interface RailSplit { ngn: number; coins: number; count: number }
interface CashAgg { count: number; coins: number; ngn: number }
interface AnalyticsData {
  range: RangeKey
  generatedAt: string
  meta: { truncated: boolean }
  users: {
    total: number; clients: number; companions: number; admins: number
    newSignups: number; prevNewSignups: number | null
    verifiedCompanions: number; companionsSetupComplete: number
  }
  revenue: {
    totalCashInNgn: number; prevTotalCashInNgn: number | null
    connectionFeesNgn: number; prevConnectionFeesNgn: number | null
    topups: { total: { ngn: number; coins: number }; card: RailSplit; transfer: RailSplit; crypto: RailSplit }
    prevTopupsNgn: number | null
    gifts: { volumeCoins: number; hostEarningsCoins: number; platformCoins: number; platformNgnEq: number; count: number; cutPct: number }
    prevGiftPlatformCoins: number | null
    subscriptions: { newCount: number; activeCount: number; grossCoins: number; providerCoins: number; platformCoins: number; platformNgnEq: number }
    prevSubscriptionPlatformCoins: number | null
    boosts: { count: number; coins: number; ngnEq: number }
    cashouts: { requested: CashAgg; approved: CashAgg; paid: CashAgg; rejected: CashAgg; requestedAll: CashAgg }
    liability: { coins: number; ngnEq: number }
  }
  engagement: {
    connections: { created: number; prevCreated: number | null; paid: number; disputed: number; refunded: number; released: number; paidRatePct: number | null; completionRatePct: number | null }
    reviews: { count: number; prevCount: number | null; averageRating: number | null }
    messages: { sent: number; prevSent: number | null }
    stories: { posted: number; prevPosted: number | null }
    live: { sessions: number; prevSessions: number | null; minutes: number; prevMinutes: number | null; peakViewers: number; giftsPerSession: number | null; sessionsWithGifts: number; scheduledNow: number }
    fansOnly: { approvedInRange: number; approvedTotal: number; pendingReview: number }
  }
  funnel: {
    clients: { signups: number; profileCompleted: number; firstConnection: number; pctProfile: number; pctConnection: number }
    companions: { signups: number; setupCompleted: number; verified: number; pctSetup: number; pctVerified: number }
  }
  rankings: {
    companionsByFeeRevenue: { id: string; name: string; ngn: number; connections: number }[]
    companionsByGiftEarnings: { id: string; name: string; coins: number; grossCoins: number }[]
    gifters: { id: string; name: string; coins: number }[]
    companionsByCity: { city: string; count: number }[]
  }
  ops: {
    openReports: number; pendingVerifications: number; openDisputes: number
    errorsInRange: number; prevErrorsInRange: number | null
    pendingCashouts: number; pendingSnaps: number
    cardPayments: { paid: number; pending: number; failed: number }
    cryptoPayments: { finished: number; pending: number; failedOrExpired: number }
  }
  traffic: {
    pageviews: number; prevPageviews: number | null
    uniqueVisitors: number; prevUniqueVisitors: number | null
    activeUsers: number
    topPages: { path: string; views: number }[]
    topReferrers: { host: string; views: number }[]
  }
  errors: {
    totalInRange: number; prevTotalInRange: number | null
    top: { message: string; count: number }[]
  }
  series: { bucketStart: string; label: string; signups: number; revenueNgn: number; connections: number; visits: number }[]
}

/** Compact naira: 450000 becomes ₦450K, 1200000 becomes ₦1.2M. */
function fmtNgn(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₦${trimNum(n / 1_000_000)}M`
  if (abs >= 1_000) return `₦${trimNum(n / 1_000)}K`
  return `₦${Math.round(n).toLocaleString()}`
}
function trimNum(v: number): string {
  const r = Math.round(v * 10) / 10
  return r % 1 === 0 ? r.toString() : r.toFixed(1)
}
function fmtNum(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${trimNum(n / 1_000_000)}M`
  if (abs >= 1_000) return `${trimNum(n / 1_000)}K`
  return n.toLocaleString()
}
function fmtCoins(n: number): string {
  return `${fmtNum(n)} coins`
}

function Delta({ value, previous }: { value: number; previous: number | null }) {
  if (previous === null) return null
  if (previous === 0) {
    return value > 0 ? (
      <span className="text-xs font-semibold text-emerald-600">new this period</span>
    ) : (
      <span className="text-xs font-medium text-gray-400">no change</span>
    )
  }
  const pctChange = ((value - previous) / Math.abs(previous)) * 100
  const up = pctChange >= 0
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
        {up ? <path d="M4 1 L7 6 H1 Z" fill="currentColor" /> : <path d="M4 7 L1 2 H7 Z" fill="currentColor" />}
      </svg>
      {Math.abs(pctChange).toFixed(0)}% vs previous
    </span>
  )
}

/** KPI card: display string plus the raw number so deltas stay honest. */
function KpiNum({
  label, display, numeric, previous, sub, warn,
}: {
  label: string
  display: string
  numeric: number
  previous?: number | null
  sub?: string
  warn?: boolean
}) {
  return (
    <Card className={warn ? 'border-amber-300 bg-amber-50' : undefined}>
      <CardContent className="p-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-charcoal">{display}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {previous !== undefined && <Delta value={numeric} previous={previous} />}
          {sub && <span className="text-xs text-gray-500">{sub}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

const CHART_W = 720
const CHART_H = 200

function BarChart({ data, format }: { data: { label: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const barW = CHART_W / Math.max(data.length, 1)
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H + 22}`} className="w-full min-w-[420px]" role="img" aria-label="Bar chart">
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * CHART_H)
          return (
            <g key={i}>
              <rect
                x={i * barW + barW * 0.18}
                y={CHART_H - h}
                width={barW * 0.64}
                height={h}
                rx={3}
                className="fill-[#AC244D]"
                opacity={0.88}
              >
                <title>{`${d.label}: ${format(d.value)}`}</title>
              </rect>
              {(data.length <= 31 || i % Math.ceil(data.length / 14) === 0) && (
                <text x={i * barW + barW / 2} y={CHART_H + 16} textAnchor="middle" className="fill-gray-500" fontSize="10">
                  {d.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function LineChart({
  data,
}: {
  data: { label: string; a: number; b: number }[]
}) {
  const max = Math.max(...data.flatMap((d) => [d.a, d.b]), 1)
  const stepX = data.length > 1 ? CHART_W / (data.length - 1) : CHART_W
  const pts = (key: 'a' | 'b') =>
    data.map((d, i) => `${(i * stepX).toFixed(1)},${(CHART_H - (d[key] / max) * (CHART_H - 12)).toFixed(1)}`).join(' ')
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 rounded bg-[#AC244D]" /> Signups
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 rounded bg-[#C9A84C]" /> Connections
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H + 22}`} className="w-full min-w-[420px]" role="img" aria-label="Signups and connections trend">
          <polyline points={pts('a')} fill="none" stroke="#AC244D" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          <polyline points={pts('b')} fill="none" stroke="#C9A84C" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          {data.map((d, i) =>
            data.length <= 31 ? (
              <g key={i}>
                <circle cx={i * stepX} cy={CHART_H - (d.a / max) * (CHART_H - 12)} r="3" className="fill-[#AC244D]">
                  <title>{`${d.label}: ${d.a} signups`}</title>
                </circle>
                <circle cx={i * stepX} cy={CHART_H - (d.b / max) * (CHART_H - 12)} r="3" className="fill-[#C9A84C]">
                  <title>{`${d.label}: ${d.b} connections`}</title>
                </circle>
              </g>
            ) : null
          )}
          {data.map((d, i) =>
            data.length <= 31 || i % Math.ceil(data.length / 14) === 0 ? (
              <text key={`t${i}`} x={i * stepX} y={CHART_H + 16} textAnchor="middle" className="fill-gray-500" fontSize="10">
                {d.label}
              </text>
            ) : null
          )}
        </svg>
      </div>
    </div>
  )
}

function FunnelSteps({ steps }: { steps: { label: string; value: number; pctFromPrev: number | null }[] }) {
  const top = Math.max(steps[0]?.value ?? 0, 1)
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-charcoal">{s.label}</span>
            <span className="text-gray-500">
              {s.value.toLocaleString()}
              {s.pctFromPrev !== null && i > 0 && (
                <span className="ml-2 font-semibold text-[#AC244D]">{s.pctFromPrev.toFixed(0)}% of previous step</span>
              )}
            </span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${i === 0 ? 'bg-charcoal' : i === 1 ? 'bg-[#C9A84C]' : 'bg-[#AC244D]'}`}
              style={{ width: `${Math.max(2, (s.value / top) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AdminAnalyticsPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [range, setRange] = useState<RangeKey>('7d')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (r: RangeKey) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/analytics?range=${r}`)
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      setData((await res.json()) as AnalyticsData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      const ok = await isAdmin()
      setAuthorized(ok)
      if (ok) await load(range)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (authorized) void load(range)
  }, [range, authorized, load])

  if (authorized === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading...
      </div>
    )
  }
  if (!authorized) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-red-500" />
        <h1 className="text-xl font-bold text-gray-900">Not authorized</h1>
        <p className="mt-2 text-gray-600">This area is restricted to platform administrators.</p>
      </div>
    )
  }

  const openQueues = data
    ? data.ops.openReports + data.ops.pendingVerifications + data.ops.openDisputes + data.ops.pendingCashouts + data.ops.pendingSnaps
    : 0

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900">Analytics</h1>
          <p className="mt-1 text-sm text-gray-600">
            Money, growth and operations in one place. Coin earnings are also shown as a naira equivalent at ₦10 per coin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={`min-h-[44px] rounded-full px-4 text-sm font-medium transition-colors ${
                range === r.key ? 'bg-[#AC244D] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={() => void load(range)}
            aria-label="Refresh analytics"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}{' '}
          <button onClick={() => void load(range)} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {loading && !data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      )}

      {data && (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiNum label="Cash in" display={fmtNgn(data.revenue.totalCashInNgn)} numeric={data.revenue.totalCashInNgn} previous={data.revenue.prevTotalCashInNgn} sub="fees plus topups" />
            <KpiNum label="New signups" display={fmtNum(data.users.newSignups)} numeric={data.users.newSignups} previous={data.users.prevNewSignups} sub={`${fmtNum(data.users.total)} total users`} />
            <KpiNum label="Connections" display={fmtNum(data.engagement.connections.created)} numeric={data.engagement.connections.created} previous={data.engagement.connections.prevCreated} sub={`${fmtNum(data.engagement.connections.paid)} paid`} />
            <KpiNum label="Gift earnings (platform)" display={fmtCoins(data.revenue.gifts.platformCoins)} numeric={data.revenue.gifts.platformCoins} previous={data.revenue.prevGiftPlatformCoins} sub={`${fmtNgn(data.revenue.gifts.platformNgnEq)} equivalent`} />
            <KpiNum label="Subscription earnings" display={fmtCoins(data.revenue.subscriptions.platformCoins)} numeric={data.revenue.subscriptions.platformCoins} previous={data.revenue.prevSubscriptionPlatformCoins} sub={`${fmtNum(data.revenue.subscriptions.activeCount)} active fan clubs`} />
            <KpiNum label="Live minutes" display={fmtNum(data.engagement.live.minutes)} numeric={data.engagement.live.minutes} previous={data.engagement.live.prevMinutes} sub={`${fmtNum(data.engagement.live.sessions)} sessions`} />
            <KpiNum label="Coin liability" display={fmtCoins(data.revenue.liability.coins)} numeric={data.revenue.liability.coins} sub={`${fmtNgn(data.revenue.liability.ngnEq)} held by users`} />
            <KpiNum label="Open queues" display={fmtNum(openQueues)} numeric={openQueues} warn={openQueues > 0} sub="reports, reviews, disputes, payouts" />
          </div>

          {/* Charts */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue per {range === '24h' ? 'hour' : range === 'all' ? 'week' : 'day'}</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart
                  data={data.series.map((s) => ({ label: s.label, value: s.revenueNgn }))}
                  format={fmtNgn}
                />
                <p className="mt-2 text-xs text-gray-500">Connection fees on the day they were paid, plus coin topups on the day they settled.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Signups and connections</CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart data={data.series.map((s) => ({ label: s.label, a: s.signups, b: s.connections }))} />
              </CardContent>
            </Card>
          </div>

          {/* Traffic */}
          <h2 className="mt-8 font-display text-lg font-semibold tracking-tight text-gray-900">Traffic</h2>
          <p className="mt-1 text-xs text-gray-500">
            Counted by the app&apos;s own page view beacon, no third-party analytics service. Unique visitors are approximate:
            one per device for signed-out visits, plus each signed-in account. Visits before the beacon shipped are not recorded.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiNum label="Pageviews" display={fmtNum(data.traffic.pageviews)} numeric={data.traffic.pageviews} previous={data.traffic.prevPageviews} sub="pages opened in period" />
            <KpiNum label="Unique visitors" display={fmtNum(data.traffic.uniqueVisitors)} numeric={data.traffic.uniqueVisitors} previous={data.traffic.prevUniqueVisitors} sub="devices plus signed-in accounts" />
            <KpiNum label="Signed-in active users" display={fmtNum(data.traffic.activeUsers)} numeric={data.traffic.activeUsers} sub="accounts that viewed a page" />
            <KpiNum
              label="Pages per visitor"
              display={data.traffic.uniqueVisitors > 0 ? (data.traffic.pageviews / data.traffic.uniqueVisitors).toFixed(1) : '0'}
              numeric={data.traffic.uniqueVisitors > 0 ? data.traffic.pageviews / data.traffic.uniqueVisitors : 0}
              sub="average visit depth"
            />
          </div>
          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Visits per {range === '24h' ? 'hour' : range === 'all' ? 'week' : 'day'}</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart
                  data={data.series.map((s) => ({ label: s.label, value: s.visits }))}
                  format={fmtNum}
                />
                <p className="mt-2 text-xs text-gray-500">Every route view in the app, signed in or not. Bots and admin pages are excluded.</p>
              </CardContent>
            </Card>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Top pages</CardTitle></CardHeader>
              <CardContent>
                <RankTable
                  empty="No page views recorded in this period yet."
                  rows={data.traffic.topPages.map((r) => ({ name: r.path, main: fmtNum(r.views), sub: 'views' }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Top referrers</CardTitle></CardHeader>
              <CardContent>
                <RankTable
                  empty="No external referrers recorded in this period yet."
                  rows={data.traffic.topReferrers.map((r) => ({ name: r.host, main: fmtNum(r.views), sub: 'arrivals' }))}
                />
                <p className="mt-2 text-xs text-gray-400">Hosts only, from the page a visitor arrived from. Direct visits and arrivals from inside the app are not listed.</p>
              </CardContent>
            </Card>
          </div>

          {/* Revenue detail */}
          <h2 className="mt-8 font-display text-lg font-semibold tracking-tight text-gray-900">Revenue detail</h2>
          <div className="mt-3 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Coin topups by rail</CardTitle></CardHeader>
              <CardContent>
                {(
                  [
                    ['Card (Paystack)', data.revenue.topups.card],
                    ['Bank transfer', data.revenue.topups.transfer],
                    ['Crypto (NOWPayments)', data.revenue.topups.crypto],
                  ] as [string, RailSplit][]
                ).map(([label, r]) => {
                  const share = data.revenue.topups.total.ngn > 0 ? (r.ngn / data.revenue.topups.total.ngn) * 100 : 0
                  return (
                    <div key={label} className="mb-3">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium text-charcoal">{label}</span>
                        <span className="text-gray-500">{fmtNgn(r.ngn)} · {fmtNum(r.count)}</span>
                      </div>
                      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-[#C9A84C]" style={{ width: `${Math.max(1, share)}%` }} />
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">{fmtCoins(r.coins)} sold</p>
                    </div>
                  )
                })}
                <p className="mt-2 border-t border-gray-100 pt-2 text-sm font-semibold text-charcoal">
                  Total {fmtNgn(data.revenue.topups.total.ngn)} · {fmtCoins(data.revenue.topups.total.coins)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Platform coin earnings</CardTitle></CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-600">Gifts ({data.revenue.gifts.cutPct}% cut)</dt>
                    <dd className="text-right font-semibold text-charcoal">
                      {fmtCoins(data.revenue.gifts.platformCoins)}
                      <span className="block text-xs font-normal text-gray-400">{fmtNgn(data.revenue.gifts.platformNgnEq)} equivalent</span>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-600">Gift volume (all coins sent)</dt>
                    <dd className="font-medium text-charcoal">{fmtCoins(data.revenue.gifts.volumeCoins)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-600">Hosts kept from gifts</dt>
                    <dd className="font-medium text-charcoal">{fmtCoins(data.revenue.gifts.hostEarningsCoins)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-600">Fan club subscriptions</dt>
                    <dd className="text-right font-semibold text-charcoal">
                      {fmtCoins(data.revenue.subscriptions.platformCoins)}
                      <span className="block text-xs font-normal text-gray-400">{fmtCoins(data.revenue.subscriptions.grossCoins)} charged in total</span>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-600">Boosts</dt>
                    <dd className="font-medium text-charcoal">{fmtCoins(data.revenue.boosts.coins)} ({data.revenue.boosts.count})</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-gray-100 pt-2">
                    <dt className="text-gray-600">Connection fees</dt>
                    <dd className="font-semibold text-charcoal">{fmtNgn(data.revenue.connectionFeesNgn)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Cashouts in period</CardTitle></CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-600">Requested</dt>
                    <dd className="font-medium text-charcoal">{fmtNgn(data.revenue.cashouts.requestedAll.ngn)} ({data.revenue.cashouts.requestedAll.count})</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-600">Paid out</dt>
                    <dd className="font-semibold text-emerald-600">{fmtNgn(data.revenue.cashouts.paid.ngn)} ({data.revenue.cashouts.paid.count})</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-600">Approved, awaiting payment</dt>
                    <dd className="font-medium text-charcoal">{fmtNgn(data.revenue.cashouts.approved.ngn)} ({data.revenue.cashouts.approved.count})</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-600">Rejected (coins refunded)</dt>
                    <dd className="font-medium text-charcoal">{fmtNgn(data.revenue.cashouts.rejected.ngn)} ({data.revenue.cashouts.rejected.count})</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-gray-100 pt-2">
                    <dt className="text-gray-600">Still pending review</dt>
                    <dd className="font-medium text-charcoal">{fmtCoins(data.revenue.cashouts.requested.coins)} ({data.revenue.cashouts.requested.count})</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>

          {/* Users and engagement */}
          <h2 className="mt-8 font-display text-lg font-semibold tracking-tight text-gray-900">Users and engagement</h2>
          <div className="mt-3 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Audience</CardTitle></CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-600">Clients</dt><dd className="font-medium text-charcoal">{fmtNum(data.users.clients)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Companions</dt><dd className="font-medium text-charcoal">{fmtNum(data.users.companions)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Verified companions</dt><dd className="font-medium text-charcoal">{fmtNum(data.users.verifiedCompanions)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Companions with setup complete</dt><dd className="font-medium text-charcoal">{fmtNum(data.users.companionsSetupComplete)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Active fan club subscriptions</dt><dd className="font-medium text-charcoal">{fmtNum(data.revenue.subscriptions.activeCount)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">New fan club subscriptions</dt><dd className="font-medium text-charcoal">{fmtNum(data.revenue.subscriptions.newCount)}</dd></div>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Connections and trust</CardTitle></CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-600">Created</dt><dd className="font-medium text-charcoal">{fmtNum(data.engagement.connections.created)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Paid (fee collected)</dt><dd className="font-medium text-charcoal">{fmtNum(data.engagement.connections.paid)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Paid rate</dt><dd className="font-medium text-charcoal">{data.engagement.connections.paidRatePct === null ? 'n/a' : `${data.engagement.connections.paidRatePct}%`}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Completed (fee released)</dt><dd className="font-medium text-charcoal">{fmtNum(data.engagement.connections.released)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Completion rate</dt><dd className="font-medium text-charcoal">{data.engagement.connections.completionRatePct === null ? 'n/a' : `${data.engagement.connections.completionRatePct}%`}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Disputed</dt><dd className="font-medium text-charcoal">{fmtNum(data.engagement.connections.disputed)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Refunded</dt><dd className="font-medium text-charcoal">{fmtNum(data.engagement.connections.refunded)}</dd></div>
                  <div className="flex justify-between border-t border-gray-100 pt-2">
                    <dt className="text-gray-600">Reviews published</dt>
                    <dd className="inline-flex items-center gap-1 font-medium text-charcoal">
                      {fmtNum(data.engagement.reviews.count)}
                      {data.engagement.reviews.averageRating !== null && (
                        <span className="inline-flex items-center gap-0.5 text-gray-500">
                          · <Star className="h-3.5 w-3.5 text-[#C9A84C]" /> {data.engagement.reviews.averageRating.toFixed(1)}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-600">Messages sent</dt><dd className="font-medium text-charcoal">{fmtNum(data.engagement.messages.sent)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Stories posted</dt><dd className="font-medium text-charcoal">{fmtNum(data.engagement.stories.posted)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Live sessions</dt><dd className="font-medium text-charcoal">{fmtNum(data.engagement.live.sessions)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Peak viewers in one stream</dt><dd className="font-medium text-charcoal">{fmtNum(data.engagement.live.peakViewers)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Gifts per session</dt><dd className="font-medium text-charcoal">{data.engagement.live.giftsPerSession === null ? 'n/a' : data.engagement.live.giftsPerSession}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Streams scheduled now</dt><dd className="font-medium text-charcoal">{fmtNum(data.engagement.live.scheduledNow)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-600">Fans Only posts approved</dt><dd className="font-medium text-charcoal">{fmtNum(data.engagement.fansOnly.approvedInRange)} in period · {fmtNum(data.engagement.fansOnly.approvedTotal)} total</dd></div>
                </dl>
              </CardContent>
            </Card>
          </div>

          {/* Funnels */}
          <h2 className="mt-8 font-display text-lg font-semibold tracking-tight text-gray-900">Funnels</h2>
          <p className="mt-1 text-xs text-gray-500">Cohort: accounts created inside the selected period. Later steps count whether the step has happened by now.</p>
          <div className="mt-3 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Clients</CardTitle></CardHeader>
              <CardContent>
                <FunnelSteps
                  steps={[
                    { label: 'Signed up', value: data.funnel.clients.signups, pctFromPrev: null },
                    { label: 'Profile completed (name set)', value: data.funnel.clients.profileCompleted, pctFromPrev: data.funnel.clients.signups ? (data.funnel.clients.profileCompleted / data.funnel.clients.signups) * 100 : null },
                    { label: 'Made a first connection', value: data.funnel.clients.firstConnection, pctFromPrev: data.funnel.clients.profileCompleted ? (data.funnel.clients.firstConnection / data.funnel.clients.profileCompleted) * 100 : null },
                  ]}
                />
                <p className="mt-3 text-xs text-gray-500">Signup to first connection: {data.funnel.clients.pctConnection}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Companions</CardTitle></CardHeader>
              <CardContent>
                <FunnelSteps
                  steps={[
                    { label: 'Signed up', value: data.funnel.companions.signups, pctFromPrev: null },
                    { label: 'Setup complete (name, photo, city, rate, service)', value: data.funnel.companions.setupCompleted, pctFromPrev: data.funnel.companions.signups ? (data.funnel.companions.setupCompleted / data.funnel.companions.signups) * 100 : null },
                    { label: 'ID verified', value: data.funnel.companions.verified, pctFromPrev: data.funnel.companions.setupCompleted ? (data.funnel.companions.verified / data.funnel.companions.setupCompleted) * 100 : null },
                  ]}
                />
                <p className="mt-3 text-xs text-gray-500">Signup to verified: {data.funnel.companions.pctVerified}%</p>
              </CardContent>
            </Card>
          </div>

          {/* Rankings */}
          <h2 className="mt-8 font-display text-lg font-semibold tracking-tight text-gray-900">Rankings</h2>
          <div className="mt-3 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Top companions by connection fees</CardTitle></CardHeader>
              <CardContent>
                <RankTable
                  empty="No paid connections in this period yet."
                  rows={data.rankings.companionsByFeeRevenue.map((r) => ({
                    name: r.name,
                    main: fmtNgn(r.ngn),
                    sub: `${r.connections} paid`,
                  }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Top companions by gift earnings</CardTitle></CardHeader>
              <CardContent>
                <RankTable
                  empty="No gifts in this period yet."
                  rows={data.rankings.companionsByGiftEarnings.map((r) => ({
                    name: r.name,
                    main: fmtCoins(r.coins),
                    sub: `${fmtCoins(r.grossCoins)} sent`,
                  }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Top gifters</CardTitle></CardHeader>
              <CardContent>
                <RankTable
                  empty="No gifts in this period yet."
                  rows={data.rankings.gifters.map((r) => ({ name: r.name, main: fmtCoins(r.coins), sub: '' }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Companions by city</CardTitle></CardHeader>
              <CardContent>
                <RankTable
                  empty="No companion has set a city yet."
                  rows={data.rankings.companionsByCity.map((r) => ({ name: r.city, main: fmtNum(r.count), sub: '' }))}
                />
                <p className="mt-2 text-xs text-gray-400">Current snapshot from map presence. Client cities are not collected, so this covers companions only.</p>
              </CardContent>
            </Card>
          </div>

          {/* Ops health */}
          <h2 className="mt-8 font-display text-lg font-semibold tracking-tight text-gray-900">Operations health</h2>
          <div className="mt-3 grid gap-6 lg:grid-cols-2">
            <Card className={openQueues > 0 ? 'border-amber-300' : undefined}>
              <CardHeader><CardTitle className="text-base">Queues needing a human</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <OpsRow label="Open reports" value={data.ops.openReports} />
                  <OpsRow label="Pending verifications" value={data.ops.pendingVerifications} />
                  <OpsRow label="Open fee disputes" value={data.ops.openDisputes} />
                  <OpsRow label="Pending cashouts" value={data.ops.pendingCashouts} />
                  <OpsRow label="Fans Only posts in review" value={data.ops.pendingSnaps} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Payments and errors in period</CardTitle></CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-600">Card payments (connection fees)</dt>
                    <dd className="font-medium text-charcoal">{data.ops.cardPayments.paid} paid · {data.ops.cardPayments.pending} pending · {data.ops.cardPayments.failed} failed</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-600">Crypto payments</dt>
                    <dd className="font-medium text-charcoal">{data.ops.cryptoPayments.finished} finished · {data.ops.cryptoPayments.pending} pending · {data.ops.cryptoPayments.failedOrExpired} failed or expired</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-600">Errors logged</dt>
                    <dd className="inline-flex items-center gap-2 font-medium text-charcoal">
                      {fmtNum(data.ops.errorsInRange)}
                      <Delta value={data.ops.errorsInRange} previous={data.ops.prevErrorsInRange} />
                    </dd>
                  </div>
                </dl>
                {data.ops.cardPayments.failed + data.ops.cryptoPayments.failedOrExpired > 0 && (
                  <p className="mt-3 inline-flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Failed checkouts usually mean abandoned payments, but a rising count is worth a look at the payment rails.
                  </p>
                )}
                {data.errors.top.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Most frequent errors</p>
                    <ul className="mt-2 space-y-1.5">
                      {data.errors.top.map((e, i) => (
                        <li key={i} className="flex items-start justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate text-gray-600" title={e.message}>{e.message}</span>
                          <span className="shrink-0 font-semibold text-charcoal">{fmtNum(e.count)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <a
                  href="/admin/errors"
                  className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-[#AC244D] underline"
                >
                  Open full error log
                </a>
              </CardContent>
            </Card>
          </div>

          <p className="mt-8 text-xs leading-relaxed text-gray-400">
            How to read this page: cash in counts connection fees on the day they were paid and coin topups on the day they settled.
            Gift and subscription earnings are the platform share only, taken from per transaction records, and the naira equivalent uses the product rate of ₦10 per coin.
            Subscription history is recorded from the coin ledger, which began with the ledger rollout, so very old ranges may understate subscriptions.
            Funnels use accounts created in the period and check their later steps as of now.
            Traffic is counted by the in-app beacon from the day it shipped, and unique visitors count devices for signed-out visits plus accounts for signed-in ones, so treat that number as an approximation, not a person count.
            {data.meta.truncated && ' Note: one or more large tables hit the read cap for this range, so a few totals are approximate.'}
          </p>
        </div>
      )}
    </div>
  )
}

function RankTable({ rows, empty }: { rows: { name: string; main: string; sub: string }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-gray-500">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[260px] text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              <td className="py-2 pr-2 font-bold text-gray-400">{i + 1}</td>
              <td className="max-w-[160px] truncate py-2 pr-2 font-medium text-charcoal">{r.name}</td>
              <td className="py-2 text-right font-semibold text-charcoal">{r.main}</td>
              <td className="py-2 pl-2 text-right text-xs text-gray-400">{r.sub}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OpsRow({ label, value }: { label: string; value: number }) {
  const warn = value > 0
  return (
    <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm ${warn ? 'bg-amber-50' : 'bg-gray-50'}`}>
      <span className="font-medium text-charcoal">{label}</span>
      {warn ? (
        <span className="inline-flex items-center gap-1.5 font-bold text-amber-700">
          <AlertTriangle className="h-4 w-4" /> {value}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> 0
        </span>
      )}
    </div>
  )
}
