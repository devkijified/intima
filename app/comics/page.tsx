'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, Eye } from '@/lib/icons'

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

/** Comics: house-published episodes. Readers come back when new ones drop. */
export default function ComicsPage() {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let live = true
    supabase.from('comic_episodes')
      .select('id, episode_no, title, synopsis, cover_url, published_at, view_count')
      .eq('status', 'published')
      .order('episode_no', { ascending: false })
      .limit(60)
      .then(({ data }) => {
        if (live) { setEpisodes((data ?? []) as Episode[]); setLoading(false) }
      })
    return () => { live = false }
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-6 md:pb-10 animate-rise-in">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-muted">
          <BookOpen className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">Intima Comics</h1>
          <p className="text-sm text-neutral-500">New episodes drop regularly — come back for more.</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : episodes.length === 0 ? (
        <div className="card-luxe mt-8 p-10 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="mt-3 font-medium text-charcoal">No episodes yet</p>
          <p className="mt-1 text-sm text-neutral-500">The first episode is on its way. Check back soon.</p>
        </div>
      ) : (
        <div className="stagger mt-6 grid grid-cols-2 gap-3 sm:gap-4">
          {episodes.map((ep) => (
            <Link key={ep.id} href={`/comics/${ep.id}`} className="card-luxe group overflow-hidden transition-all duration-200 active:scale-[0.98] sm:hover:-translate-y-1 sm:hover:shadow-lift">
              <div className="relative aspect-[4/5] overflow-hidden bg-cream">
                {ep.cover_url ? (
                  <img src={ep.cover_url} alt={ep.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] animate-fade-in" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <BookOpen className="h-10 w-10 text-neutral-300" />
                  </div>
                )}
                <div className="photo-veil-top pointer-events-none absolute inset-x-0 top-0 h-16" />
                <span className="glass-dark absolute left-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-bold text-white">
                  Ep {ep.episode_no}
                </span>
                {isNew(ep.published_at) && (
                  <span className="badge-elite absolute right-2 top-2">NEW</span>
                )}
              </div>
              <div className="p-3.5">
                <p className="truncate font-display text-[15px] font-semibold tracking-tight text-charcoal">{ep.title}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                  <Eye className="h-3 w-3" /> {ep.view_count.toLocaleString()} reads
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
