'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Bell, BookOpen, ChevronRight, Eye, Play } from '@/lib/icons'
import { HelpTip, Tooltip } from '@/components/ui/Tooltip'
import { showToast } from '@/lib/toast'
import { formatCompactCount } from '@/lib/utils/helpers'

interface ComicSeries {
  id: string
  title: string
  synopsis: string
  cover_url: string | null
}

interface Episode {
  id: string
  episode_no: number
  title: string
  synopsis: string | null
  cover_url: string | null
  published_at: string | null
  view_count: number
}

const isNew = (publishedAt: string | null) =>
  publishedAt && Date.now() - new Date(publishedAt).getTime() < 7 * 24 * 3600 * 1000

/**
 * One Comic, storybook style: a cover plate up top, the story so
 * far, then every episode as a chapter. Start Reading opens the
 * first episode; chapters open the reader directly.
 */
export default function ComicSeriesPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const [comic, setComic] = useState<ComicSeries | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [notFound, setNotFound] = useState(false)
  const [stats, setStats] = useState<{ total: number; monthly: number } | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  const [following, setFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    let live = true
    ;(async () => {
      const [{ data: c }, { data: eps }] = await Promise.all([
        supabase.from('comics')
          .select('id, title, synopsis, cover_url, story_status')
          .eq('id', id)
          .eq('status', 'published')
          .maybeSingle(),
        supabase.from('comic_episodes')
          .select('id, episode_no, title, synopsis, cover_url, published_at, view_count')
          .eq('comic_id', id)
          .eq('status', 'published')
          .order('episode_no', { ascending: true }),
      ])
      if (!live) return
      if (!c) { setNotFound(true); return }
      setComic(c as ComicSeries)
      setEpisodes((eps ?? []) as Episode[])
      const { data: rows } = await supabase.rpc('comic_stats')
      if (live && Array.isArray(rows)) {
        const row = (rows as any[]).find((r) => r.comic_id === id)
        if (row) setStats({ total: Number(row.total_views ?? 0), monthly: Number(row.monthly_views ?? 0) })
      }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Follow state for the Notify me button. Opening the series also
  // marks it seen, which clears this series' share of the nav
  // badge. Best effort: the badge recounts on the next navigation.
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch('/api/comics/follow')
        const json = await res.json().catch(() => ({}))
        if (!live) return
        setSignedIn(json.signedIn === true)
        const isFollowing = Array.isArray(json.following) && json.following.includes(id)
        setFollowing(isFollowing)
        if (json.signedIn && isFollowing) {
          fetch('/api/comics/follow', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comicId: id }),
          }).catch(() => {})
        }
      } catch { /* the button simply stays in its off state */ }
    })()
    return () => { live = false }
  }, [id])

  async function toggleFollow() {
    if (!signedIn) { router.push('/login'); return }
    if (followBusy) return
    setFollowBusy(true)
    try {
      const res = await fetch('/api/comics/follow', {
        method: following ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comicId: id }),
      })
      if (!res.ok) throw new Error('follow failed')
      setFollowing(!following)
      showToast(following ? 'Notifications off for this series.' : 'We will notify you when a new episode lands.')
    } catch {
      showToast('Something went wrong. Please try again.')
    } finally {
      setFollowBusy(false)
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl px-4 pb-20 pt-16 text-center">
        <p className="font-display text-2xl font-semibold text-charcoal">This comic is not on the shelf</p>
        <Link href="/comics" className="btn-luxe mt-6 inline-flex min-h-[44px] items-center justify-center px-6 py-2.5 text-sm">All comics</Link>
      </div>
    )
  }

  const cover = comic?.cover_url ?? episodes[episodes.length - 1]?.cover_url ?? null
  const first = episodes[0]

  return (
    <div className="mx-auto max-w-2xl pb-28 animate-fade-in md:pb-12">
      {/* Cover plate: the cover sharp over its own blurred fill,
          the same treatment as the shelf's featured banner. */}
      <div className="relative overflow-hidden bg-charcoal">
        {cover ? (
          <>
            <img src={cover} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl" />
            <img src={cover} alt={comic?.title ?? ''} fetchPriority="high" className="relative aspect-[16/10] w-full object-contain sm:aspect-[16/8]" />
          </>
        ) : (
          <div className="flex aspect-[16/10] w-full items-center justify-center bg-gradient-to-br from-[#2A1220] to-[#AC244D] sm:aspect-[16/8]">
            <BookOpen className="h-14 w-14 text-white/50" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30" />
        <div className="absolute left-0 right-0 top-0 flex items-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Tooltip label="Back to all comics" side="bottom" align="start">
          <Link href="/comics" aria-label="Back to all comics"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur active:scale-95">
            <ArrowLeft aria-hidden className="h-5 w-5" />
          </Link>
          </Tooltip>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">An Intima comic</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-white">{comic?.title ?? '…'}</h1>
          {comic && (
            <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${(comic as any).story_status === 'completed' ? 'bg-white/20 text-white' : 'bg-[#C9A84C] text-charcoal'}`}>
              {(comic as any).story_status === 'completed' ? 'Completed' : 'Ongoing'}
            </span>
          )}
          {comic?.synopsis && (
            <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-white/80">{comic.synopsis}</p>
          )}
          <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-white/85">
            <span className="inline-flex items-center gap-1">
              <Eye aria-hidden className="h-3.5 w-3.5" />
              {formatCompactCount(stats?.total ?? episodes.reduce((sum, e) => sum + (e.view_count ?? 0), 0))} views
            </span>
            {stats && (
              <>
                <span aria-hidden className="text-white/40">·</span>
                <span>{formatCompactCount(stats.monthly)} this month</span>
              </>
            )}
            <span aria-hidden className="text-white/40">·</span>
            <span>{episodes.length} {episodes.length === 1 ? 'episode' : 'episodes'}</span>
          </p>
        </div>
      </div>

      <div className="px-4">
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFollow}
            disabled={followBusy}
            aria-pressed={following}
            className={
              'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all active:scale-95 disabled:opacity-60 ' +
              (following
                ? 'bg-[#C9A84C] text-charcoal'
                : 'bg-white text-charcoal ring-1 ring-black/[0.08]')
            }
          >
            <Bell aria-hidden className="h-4 w-4" />
            {following ? 'Notifying' : 'Notify me'}
          </button>
          <HelpTip text="We will send you a push and a notification when a new episode of this series lands." />
        </div>
        {first && (
          <Link
            href={`/comics/${first.id}`}
            className="btn-luxe mt-3 inline-flex min-h-[50px] w-full items-center justify-center gap-2 px-6 py-3 text-[15px]"
          >
            <Play aria-hidden className="h-4 w-4" />
            Start reading: Episode {first.episode_no}
          </Link>
        )}

        <h2 className="t-section-title mt-7 text-charcoal">Episodes</h2>
        <div className="mt-3 space-y-2.5">
          {episodes.length === 0 ? (
            <p className="rounded-3xl bg-white p-6 text-center text-sm text-neutral-500 ring-1 ring-black/[0.04]">
              The first episode is on its way. Check back soon.
            </p>
          ) : (
            episodes.map((ep) => (
              <Link
                key={ep.id}
                href={`/comics/${ep.id}`}
                className="group flex items-center gap-3.5 rounded-3xl bg-white p-3 ring-1 ring-black/[0.045] shadow-soft transition-all active:scale-[0.99]"
              >
                <span className="relative h-[72px] w-14 shrink-0 overflow-hidden rounded-2xl bg-cream">
                  {ep.cover_url ? (
                    <img src={ep.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      <BookOpen className="h-5 w-5 text-neutral-300" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Episode {ep.episode_no}</span>
                    {isNew(ep.published_at) && <span className="badge-elite">NEW</span>}
                  </span>
                  <span className="mt-0.5 block truncate font-display text-[15px] font-semibold tracking-tight text-charcoal">{ep.title}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                    <Eye aria-hidden className="h-3 w-3" /> {formatCompactCount(ep.view_count)} views
                  </span>
                </span>
                <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
