'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, Lock, Radio, X } from '@/lib/icons'
import { formatCompactCount } from '@/lib/utils/helpers'

interface LiveStream {
  id: string
  provider_id: string
  title: string
  price_ngn: number
  viewer_count: number
  featured: boolean
  started_at: string
  provider: {
    display_name: string
    avatar_url: string | null
    city: string | null
  } | null
}

/**
 * TikTok-style live feed: vertical swipe through live streams.
 * Free streams join instantly; paid streams show the price gate.
 * The companion decides free vs paid per stream.
 */
export default function LiveFeedPage() {
  const [streams, setStreams] = useState<LiveStream[]>([])
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const feedRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchLive() {
      const { data } = await supabase
        .from('live_sessions')
        .select(`
          id, provider_id, title, price_ngn, viewer_count, featured, started_at,
          provider:profiles!live_sessions_provider_id_fkey (
            display_name, avatar_url
          )
        `)
        .eq('status', 'live')
        .eq('is_public', true)
        .order('featured', { ascending: false })
        .order('viewer_count', { ascending: false })

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

  const handleScroll = () => {
    const el = feedRef.current
    if (!el || el.clientHeight === 0) return
    const index = Math.round(el.scrollTop / el.clientHeight)
    if (index !== activeIndex) setActiveIndex(index)
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#AC244D] border-t-transparent" />
      </div>
    )
  }

  if (streams.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Radio className="mx-auto h-12 w-12 text-neutral-300" />
        <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">No one is live</h1>
        <p className="mt-2 text-sm text-neutral-500">
          When companions go live, their streams appear here. Check back soon.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white"
        >
          Browse companions
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <div
        ref={feedRef}
        onScroll={handleScroll}
        className="flex h-[calc(100vh-120px)] snap-y snap-mandatory flex-col overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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

              {/* Join: free vs paid */}
              {s.price_ngn > 0 ? (
                <Link
                  href={`/live/${s.id}`}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-gold py-3 text-sm font-bold text-charcoal active:scale-[0.98]"
                >
                  <Lock className="h-4 w-4" />
                  Join for ₦{s.price_ngn.toLocaleString()}
                </Link>
              ) : (
                <Link
                  href={`/live/${s.id}`}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-bold text-white active:scale-[0.98]"
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
    </div>
  )
}
