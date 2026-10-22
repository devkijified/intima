'use client'

import { PullToRefresh } from '@/components/shared/PullToRefresh'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, ChevronRight } from '@/lib/icons'


interface ComicSeries {
  id: string
  title: string
  synopsis: string
  story_status?: string
  cover_url: string | null
  episodeCount: number
  latestNo: number
  latestAt: string | null
  totalReads: number
}

const isFresh = (at: string | null) =>
  at !== null && Date.now() - new Date(at).getTime() < 7 * 24 * 3600 * 1000

/**
 * Comics shelf: pick a Comic first, then its episodes, like a
 * magazine rack. Series data comes from the comics table; episode
 * counts and freshness roll up from its published episodes.
 */
export default function ComicsPage() {
  const [series, setSeries] = useState<ComicSeries[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const load = async () => {
    const [{ data: comics }, { data: eps }] = await Promise.all([
      supabase.from('comics')
        .select('id, title, synopsis, cover_url, story_status')
        .eq('status', 'published')
        .order('created_at', { ascending: true }),
      supabase.from('comic_episodes')
        .select('id, comic_id, episode_no, cover_url, published_at, view_count')
        .eq('status', 'published')
        .order('episode_no', { ascending: false }),
    ])
    const byComic = new Map<string, { count: number; latestNo: number; latestAt: string | null; cover: string | null; reads: number }>()
    for (const e of (eps ?? []) as any[]) {
      if (!e.comic_id) continue
      const cur = byComic.get(e.comic_id) ?? { count: 0, latestNo: 0, latestAt: null, cover: null, reads: 0 }
      cur.count += 1
      cur.reads += e.view_count ?? 0
      if (e.episode_no > cur.latestNo) {
        cur.latestNo = e.episode_no
        cur.latestAt = e.published_at
        cur.cover = e.cover_url
      }
      byComic.set(e.comic_id, cur)
    }
    const list: ComicSeries[] = ((comics ?? []) as any[]).map((c) => {
      const roll = byComic.get(c.id)
      return {
        id: c.id,
        title: c.title,
        story_status: c.story_status ?? 'ongoing',
        synopsis: c.synopsis ?? '',
        cover_url: c.cover_url ?? roll?.cover ?? null,
        episodeCount: roll?.count ?? 0,
        latestNo: roll?.latestNo ?? 0,
        latestAt: roll?.latestAt ?? null,
        totalReads: roll?.reads ?? 0,
      }
    }).filter((s) => s.episodeCount > 0)
    // Freshest series first: the rack leads with what just dropped.
    list.sort((a, b) => +new Date(b.latestAt ?? 0) - +new Date(a.latestAt ?? 0))
    setSeries(list)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [featured, ...rest] = series

  return (
    <PullToRefresh onRefresh={load} className="mx-auto max-w-3xl px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] md:pb-10 animate-rise-in">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-muted">
          <BookOpen className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h1 className="t-display text-charcoal">Intima Comics</h1>
          <p className="text-sm text-neutral-500">Pick a comic, then settle in. New episodes drop regularly.</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : series.length === 0 ? (
        <div className="card-luxe mt-8 p-10 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="mt-3 font-medium text-charcoal">No comics yet</p>
          <p className="mt-1 text-sm text-neutral-500">The first story is on its way. Check back soon.</p>
        </div>
      ) : (
        <>
          {featured && (
            <Link
              href={`/comics/series/${featured.id}`}
              className="group relative mt-6 block overflow-hidden rounded-[28px] shadow-lift ring-1 ring-black/[0.06] transition-all duration-200 active:scale-[0.99]"
            >
              <div className="relative aspect-[16/10] bg-charcoal sm:aspect-[16/8]">
                {featured.cover_url ? (
                  <img src={featured.cover_url} alt={featured.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#2A1220] to-[#AC244D]">
                    <BookOpen className="h-12 w-12 text-white/50" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-gold">
                    {isFresh(featured.latestAt) ? 'New episode out now' : 'Featured comic'}
                  </p>
                  <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-white">{featured.title}</p>
                  <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${featured.story_status === 'completed' ? 'bg-white/20 text-white' : 'bg-[#C9A84C] text-charcoal'}`}>
                    {featured.story_status === 'completed' ? 'Completed' : 'Ongoing'}
                  </span>
                  {featured.synopsis && (
                    <p className="mt-1 line-clamp-2 max-w-lg text-sm text-white/75">{featured.synopsis}</p>
                  )}
                  <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-white/85">
                    <BookOpen aria-hidden className="h-3.5 w-3.5" />
                    {featured.episodeCount} {featured.episodeCount === 1 ? 'episode' : 'episodes'}
                    <ChevronRight aria-hidden className="h-3.5 w-3.5" />
                  </p>
                </div>
              </div>
            </Link>
          )}

          <div className="stagger mt-5 grid grid-cols-2 gap-3 sm:gap-4">
            {rest.map((s) => (
              <Link key={s.id} href={`/comics/series/${s.id}`} className="card-luxe group overflow-hidden transition-all duration-200 active:scale-[0.98] sm:hover:-translate-y-1 sm:hover:shadow-lift">
                <div className="relative aspect-[4/5] overflow-hidden bg-cream">
                  {s.cover_url ? (
                    <img src={s.cover_url} alt={s.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] animate-fade-in" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#2A1220] to-[#AC244D]">
                      <BookOpen className="h-10 w-10 text-white/50" />
                    </div>
                  )}
                  <div className="photo-veil-top pointer-events-none absolute inset-x-0 top-0 h-16" />
                  {isFresh(s.latestAt) && (
                    <span className="badge-elite absolute right-2 top-2">NEW</span>
                  )}
                </div>
                <div className="p-3.5">
                  <p className="flex items-center gap-2 truncate font-display text-[15px] font-semibold tracking-tight text-charcoal">
                    <span className="truncate">{s.title}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${s.story_status === 'completed' ? 'bg-neutral-200 text-neutral-500' : 'bg-[#C9A84C]/25 text-[#8a6d2a]'}`}>
                      {s.story_status === 'completed' ? 'Completed' : 'Ongoing'}
                    </span>
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                    <BookOpen aria-hidden className="h-3 w-3" /> {s.episodeCount} {s.episodeCount === 1 ? 'episode' : 'episodes'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </PullToRefresh>
  )
}
