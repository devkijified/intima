'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Bell, Calendar, Clock, Crown, Eye, Lock, Radio } from '@/lib/icons'
import { showToast } from '@/lib/toast'
import { IntimaLoader } from '@/components/shared/IntimaLoader'
import { formatCompactCount } from '@/lib/utils/helpers'

interface LiveStream {
  id: string
  provider_id: string
  title: string
  price_ngn: number
  access_mode: string
  viewer_count: number
  featured: boolean
  started_at: string
  provider: {
    display_name: string
    avatar_url: string | null
    username: string | null
    city: string | null
  } | null
}

interface ScheduledStream {
  id: string
  provider_id: string
  title: string
  price_ngn: number
  access_mode: string
  scheduled_for: string
  provider: {
    display_name: string
    avatar_url: string | null
    username: string | null
  } | null
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * TikTok-style live feed: vertical swipe through live streams.
 * Free streams join instantly; paid streams show the price gate.
 * The companion decides free vs paid per stream.
 * Above the feed: an Upcoming section for scheduled streams, plus the
 * host's own schedule form and Go live buttons on her scheduled rows.
 */
export default function LiveFeedPage() {
  const [streams, setStreams] = useState<LiveStream[]>([])
  const [scheduled, setScheduled] = useState<ScheduledStream[]>([])
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [myId, setMyId] = useState<string | null>(null)
  const [isModel, setIsModel] = useState(false)
  // Providers whose fan club I effectively belong to (active, or
  // cancelled with the paid period still running). Fans mode streams
  // from these hosts open for me; everyone else's route to the fan
  // club on her profile.
  const [fanOf, setFanOf] = useState<Set<string>>(new Set())
  // "Notify me" state per scheduled session: total interested plus
  // whether I am one of them. Loaded with the scheduled list from
  // live_interests (plain select, no embeds).
  const [interests, setInterests] = useState<Record<string, { count: number; mine: boolean }>>({})
  const [schedTitle, setSchedTitle] = useState('')
  const [schedWhen, setSchedWhen] = useState('')
  const [schedBusy, setSchedBusy] = useState(false)
  const [schedMsg, setSchedMsg] = useState('')
  const [goingLiveId, setGoingLiveId] = useState<string | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  // A failed query must never masquerade as an empty feed again (the
  // missing live_sessions to profiles foreign key hid behind "No one
  // is live" for weeks). Send failures to the error log.
  const reportQueryError = (where: string, err: unknown) => {
    if (!err) return
    void fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `live page query failed (${where}): ${(err as any)?.message ?? 'unknown error'}`,
        route: '/live',
      }),
    }).catch(() => {})
  }

  useEffect(() => {
    async function fetchLive() {
     try {
      const { data, error } = await supabase
        .from('live_sessions')
        .select(`
          id, provider_id, title, price_ngn, access_mode, viewer_count, featured, started_at,
          provider:profiles!live_sessions_provider_id_fkey (
            display_name, avatar_url, username
          )
        `)
        .eq('status', 'live')
        .eq('is_public', true)
        .order('featured', { ascending: false })
        .order('viewer_count', { ascending: false })
      reportQueryError('live', error)

      // Attach city from provider_presence.
      const list: LiveStream[] = (data ?? []) as any
      if (list.length > 0) {
        const ids = list.map((s) => s.provider_id)
        const { data: presence } = await supabase
          .from('provider_presence')
          .select('provider_id, city')
          .in('provider_id', ids)
        const cityById = new Map((presence ?? []).map((p: any) => [p.provider_id, p.city]))
        list.forEach((s) => {
          if (s.provider) s.provider.city = cityById.get(s.provider_id) ?? null
        })
      }
      setStreams(list)
      setLoading(false)
     } finally {
      setLoading(false)
     }
    }
    fetchLive()

    // Realtime: new streams and viewer counts.
    const ch = supabase
      .channel('live-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions' }, () => fetchLive())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [supabase])

  useEffect(() => {
    async function fetchScheduled() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setMyId(user.id)
        const { data: prof } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        // The host section (schedule form, my streams, Go live)
        // is for companions, plus admins testing the live flow.
        setIsModel(['model', 'admin', 'super_admin'].includes(prof?.role ?? ''))
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('provider_id, status, current_period_end')
          .eq('subscriber_id', user.id)
        const nowMs = Date.now()
        setFanOf(
          new Set(
            (subs ?? [])
              .filter(
                (s: any) =>
                  s.status === 'active' ||
                  (s.status === 'cancelled' &&
                    new Date(s.current_period_end).getTime() > nowMs)
              )
              .map((s: any) => s.provider_id as string)
          )
        )
      }
      const { data, error } = await supabase
        .from('live_sessions')
        .select(`
          id, provider_id, title, price_ngn, access_mode, scheduled_for,
          provider:profiles!live_sessions_provider_id_fkey (
            display_name, avatar_url, username
          )
        `)
        .eq('status', 'scheduled')
        .not('scheduled_for', 'is', null)
        .gte('scheduled_for', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(20)
      reportQueryError('scheduled', error)
      // RLS on live_sessions already limits what a caller can read, so
      // every scheduled row returned here is safe to list.
      const list = (data ?? []) as unknown as ScheduledStream[]
      setScheduled(list)
      if (list.length > 0) {
        const { data: rows } = await supabase
          .from('live_interests')
          .select('session_id, user_id')
          .in('session_id', list.map((x) => x.id))
        const map: Record<string, { count: number; mine: boolean }> = {}
        for (const x of list) map[x.id] = { count: 0, mine: false }
        for (const r of (rows ?? []) as { session_id: string; user_id: string }[]) {
          const entry = map[r.session_id]
          if (!entry) continue
          entry.count += 1
          if (user && r.user_id === user.id) entry.mine = true
        }
        setInterests(map)
      }
    }
    fetchScheduled()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleInterest = async (s: ScheduledStream) => {
    if (!myId) {
      showToast('Log in to get notified')
      router.push('/login')
      return
    }
    const prev = interests[s.id] ?? { count: 0, mine: false }
    const optimistic = { count: Math.max(0, prev.count + (prev.mine ? -1 : 1)), mine: !prev.mine }
    setInterests((m) => ({ ...m, [s.id]: optimistic }))
    try {
      const res = await fetch('/api/live/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: s.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not update')
      setInterests((m) => ({
        ...m,
        [s.id]: { count: typeof j.count === 'number' ? j.count : optimistic.count, mine: !!j.interested },
      }))
      if (j.interested) {
        showToast(`We'll notify you when ${s.provider?.display_name ?? 'the host'} goes live`)
      }
    } catch {
      setInterests((m) => ({ ...m, [s.id]: prev }))
      showToast('Could not update. Please try again.')
    }
  }

  const handleScroll = () => {
    const el = feedRef.current
    if (!el || el.clientHeight === 0) return
    const index = Math.round(el.scrollTop / el.clientHeight)
    if (index !== activeIndex) setActiveIndex(index)
  }

  const submitSchedule = async () => {
    if (!schedWhen || schedBusy) return
    setSchedBusy(true)
    setSchedMsg('')
    try {
      const res = await fetch('/api/live/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: schedTitle.trim() || 'Live',
          scheduledFor: new Date(schedWhen).toISOString(),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not schedule')
      setSchedMsg('Scheduled. It will show in Upcoming until you go live.')
      setSchedTitle('')
      setSchedWhen('')
      if (j.session) {
        setScheduled((prev) =>
          [...prev, { ...j.session, scheduled_for: j.session.scheduled_for, provider: null }].sort(
            (a, b) => +new Date(a.scheduled_for) - +new Date(b.scheduled_for)
          )
        )
      }
    } catch (e) {
      setSchedMsg(e instanceof Error ? e.message : 'Could not schedule')
    } finally {
      setSchedBusy(false)
    }
  }

  const goLive = async (s: ScheduledStream) => {
    if (goingLiveId) return
    setGoingLiveId(s.id)
    try {
      const res = await fetch('/api/live/go-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: s.id }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Could not go live')
      }
      // Session is live and followers are notified. The host studio
      // picks the session up by id and publishes into the same room.
      router.push(`/models/live?session=${s.id}`)
    } catch (e) {
      setSchedMsg(e instanceof Error ? e.message : 'Could not go live')
      setGoingLiveId(null)
    }
  }

  if (loading) {
    return (
      <div data-page-loader className="flex min-h-[60vh] items-center justify-center">
        <IntimaLoader size="lg" />
      </div>
    )
  }

  const myScheduled = scheduled.filter((s) => myId && s.provider_id === myId)
  const showHeader = scheduled.length > 0 || isModel

  return (
    <div className="mx-auto max-w-md">
      {showHeader && (
        <div className="px-4 pb-2 pt-4">
          {/* Upcoming scheduled streams */}
          {scheduled.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-charcoal">
                <Calendar className="h-5 w-5 text-primary" aria-hidden /> Upcoming live
              </h2>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                Tap Notify me and we will ping you the moment a stream starts.
              </p>
              <div className="mt-3 space-y-2">
                {scheduled.map((s) => {
                  const mine = myId && s.provider_id === myId
                  return (
                    <div
                      key={s.id}
                      className="card-luxe p-3.5"
                    >
                      <div className="flex items-center gap-3">
                      {s.provider?.avatar_url ? (
                        <img
                          src={s.provider.avatar_url}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover ring-1 ring-black/[0.05]"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-muted font-display font-semibold text-primary">
                          {(s.provider?.display_name ?? 'C')[0]}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-charcoal">{s.title}</p>
                        <p className="truncate text-xs text-neutral-500">
                          {s.provider?.display_name ?? 'Companion'}
                          {s.access_mode === 'fans'
                            ? ' · Fans only'
                            : s.price_ngn > 0
                              ? ` · ₦${s.price_ngn.toLocaleString()} to join`
                              : ' · Free'}
                        </p>
                        <p className="flex items-center gap-1 text-xs font-medium text-primary">
                          <Clock className="h-3 w-3" /> {formatWhen(s.scheduled_for)}
                        </p>
                      </div>
                      {mine ? (
                        <button
                          onClick={() => goLive(s)}
                          disabled={goingLiveId === s.id}
                          className="flex min-h-[44px] shrink-0 items-center rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-soft transition-all hover:bg-red-700 active:scale-[0.98] disabled:opacity-50"
                        >
                          {goingLiveId === s.id ? 'Starting…' : 'Go live'}
                        </button>
                      ) : s.access_mode === 'fans' && !fanOf.has(s.provider_id) ? (
                        <Link
                          href={`/companion/${s.provider?.username ?? s.provider_id}`}
                          className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-full bg-gold px-3 py-2 text-xs font-bold text-charcoal shadow-gold transition-all active:scale-[0.98]"
                        >
                          <Crown className="h-3 w-3" /> Join fan club
                        </Link>
                      ) : s.access_mode === 'fans' ? (
                        <span className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-full bg-gold/20 px-3 py-2 text-xs font-bold text-charcoal">
                          <Crown className="h-3 w-3" aria-hidden /> Fan
                        </span>
                      ) : null}
                      </div>
                      {mine ? (
                        (interests[s.id]?.count ?? 0) > 0 ? (
                          <p className="mt-2 text-[11px] font-medium leading-4 text-neutral-500">
                            {interests[s.id].count}{' '}
                            {interests[s.id].count === 1 ? 'person is waiting' : 'people are waiting'}
                          </p>
                        ) : null
                      ) : (
                        <div className="mt-2 flex items-center gap-3">
                          <button
                            onClick={() => toggleInterest(s)}
                            aria-pressed={interests[s.id]?.mine ?? false}
                            className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-xs font-bold transition-colors ${
                              interests[s.id]?.mine
                                ? 'bg-primary text-white'
                                : 'border border-primary/30 bg-primary/5 text-primary'
                            }`}
                          >
                            <Bell className="h-4 w-4" aria-hidden />
                            {interests[s.id]?.mine ? "You'll be notified" : 'Notify me'}
                          </button>
                          {(interests[s.id]?.count ?? 0) > 0 && (
                            <span className="text-[11px] font-medium text-neutral-500">
                              {interests[s.id].count} interested
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Host: schedule a stream for later */}
          {isModel && (
            <section className="card-luxe mt-4 p-5">
              <h3 className="font-display text-base font-semibold tracking-tight text-charcoal">Schedule a stream</h3>
              <p className="mt-0.5 text-xs text-neutral-500">
                Announce it now, go live when the time comes. Your scheduled streams are the ones
                above with a Go live button.
              </p>
              <input
                value={schedTitle}
                onChange={(e) => setSchedTitle(e.target.value)}
                placeholder="Stream title"
                maxLength={80}
                className="mt-3 w-full rounded-2xl border border-neutral-200 bg-white px-3.5 py-2.5 text-base outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/15 md:text-sm"
              />
              <label className="mt-3 block text-xs font-medium text-neutral-500">
                Schedule for later
                <input
                  type="datetime-local"
                  value={schedWhen}
                  onChange={(e) => setSchedWhen(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-neutral-200 bg-white px-3.5 py-2.5 text-base text-charcoal outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/15 md:text-sm"
                />
              </label>
              <button
                onClick={submitSchedule}
                disabled={!schedWhen || schedBusy}
                className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-full bg-charcoal py-2.5 text-sm font-bold text-white shadow-soft transition-all hover:bg-charcoal/90 active:scale-[0.98] disabled:opacity-40"
              >
                {schedBusy ? 'Scheduling…' : 'Schedule stream'}
              </button>
              {schedMsg && <p className="mt-2 text-center text-xs text-neutral-500">{schedMsg}</p>}
              {myScheduled.length === 0 && (
                <p className="mt-1 text-center text-[11px] text-neutral-400">
                  Nothing scheduled yet.
                </p>
              )}
            </section>
          )}
        </div>
      )}

      {streams.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-muted">
            <Radio className="h-7 w-7 text-[#AC244D]" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-charcoal">No one is live</h1>
          <p className="mt-2 text-sm text-neutral-500">
            When companions go live, their streams appear here. Check back soon.
          </p>
          <Link
            href="/"
            className="btn-luxe mt-6 min-h-[44px] px-6 py-2.5 text-sm"
          >
            Browse companions
          </Link>
        </div>
      ) : (
        <div
          ref={feedRef}
          onScroll={handleScroll}
          className="flex h-[calc(100dvh-120px)] snap-y snap-mandatory flex-col overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {streams.map((s, i) => (
            <div key={s.id} className="relative h-full w-full shrink-0 snap-start bg-charcoal">
              {/* Stream cover: avatar backdrop */}
              {s.provider?.avatar_url ? (
                <img
                  src={s.provider.avatar_url}
                  alt={s.title}
                  className="h-full w-full object-cover opacity-80"
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Radio className="h-16 w-16 text-neutral-600" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />

              {/* LIVE badge + viewers */}
              <div className="absolute left-3 top-3 flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  LIVE
                </span>
                <span className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white backdrop-blur-sm">
                  <Eye className="h-3 w-3" />
                  {formatCompactCount(s.viewer_count)}
                </span>
                {s.featured && (
                  <span className="rounded-full bg-gold px-2.5 py-1 text-xs font-bold text-charcoal">
                    Featured
                  </span>
                )}
                {s.access_mode === 'fans' && (
                  <span className="flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-xs font-bold text-charcoal">
                    <Crown className="h-3 w-3" />
                    Fans Only
                  </span>
                )}
              </div>

              {/* Provider + title */}
              <div className="absolute inset-x-0 bottom-0 p-4">
                <div className="flex items-center gap-3">
                  {s.provider?.avatar_url ? (
                    <img
                      src={s.provider.avatar_url}
                      alt=""
                      className="h-11 w-11 rounded-full border-2 border-white object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-600 text-white font-bold">
                      {(s.provider?.display_name ?? 'M')[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">
                      {s.provider?.display_name ?? 'Companion'}
                      {s.provider?.city && (
                        <span className="font-normal text-white/70"> • {s.provider.city}</span>
                      )}
                    </p>
                    <p className="truncate text-sm text-white/80">{s.title}</p>
                  </div>
                </div>

                {/* Join: fans only, paid, or free */}
                {s.access_mode === 'fans' ? (
                  myId === s.provider_id || fanOf.has(s.provider_id) ? (
                    <Link
                      href={`/live/${s.id}`}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-bold text-white shadow-cta transition-all active:scale-[0.98]"
                    >
                      <Crown className="h-4 w-4" />
                      Watch now
                    </Link>
                  ) : (
                    <Link
                      href={`/companion/${s.provider?.username ?? s.provider_id}`}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gold py-3 text-sm font-bold text-charcoal shadow-gold transition-all active:scale-[0.98]"
                    >
                      <Crown className="h-4 w-4" />
                      Fans only · Join her fan club
                    </Link>
                  )
                ) : s.price_ngn > 0 ? (
                  <Link
                    href={`/live/${s.id}`}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gold py-3 text-sm font-bold text-charcoal shadow-gold transition-all active:scale-[0.98]"
                  >
                    <Lock className="h-4 w-4" />
                    Join for ₦{s.price_ngn.toLocaleString()}
                  </Link>
                ) : (
                  <Link
                    href={`/live/${s.id}`}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-bold text-white shadow-cta transition-all active:scale-[0.98]"
                  >
                    <Eye className="h-4 w-4" />
                    Watch free
                  </Link>
                )}
              </div>

              {/* Active indicator dots */}
              {streams.length > 1 && (
                <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-1.5">
                  {streams.map((_, d) => (
                    <span
                      key={d}
                      className={`h-1.5 rounded-full transition-all ${
                        d === activeIndex ? 'h-5 bg-white' : 'w-1.5 bg-white/50'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
