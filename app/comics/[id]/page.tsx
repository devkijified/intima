'use client'

import { formatCompactCount } from '@/lib/utils/helpers'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, ChevronRight } from '@/lib/icons'
import { Tooltip } from '@/components/ui/Tooltip'
import { PhotoWatermark } from '@/components/media/PhotoWatermark'

interface Episode {
  id: string
  episode_no: number
  title: string
  synopsis: string | null
  panel_urls: string[]
  view_count: number
  comic_id: string | null
  cover_url: string | null
}

/**
 * One reader panel: a fixed full-width cell on a dark ground, so a
 * panel that is still loading (or one that failed) never shifts the
 * column or leaves a broken hole. Every loaded panel carries the
 * platform watermark, straight at the bottom centre, like photos.
 * A failed panel swaps to a neat dark tile with a tap to retry.
 */
function PanelImage({ src, index, eager }: { src: string; index: number; eager: boolean }) {
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const liveSrc = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}cb=${attempt}`

  return (
    <div className="relative w-full bg-[#171017]">
      {failed ? (
        <button
          type="button"
          onClick={() => { setAttempt((a) => a + 1); setFailed(false) }}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 px-6 text-center"
        >
          <span className="font-display text-base font-semibold text-white/85">This page could not load</span>
          <span className="text-sm font-medium text-gold">Tap to retry</span>
        </button>
      ) : (
        <>
          <img
            key={attempt}
            src={liveSrc}
            alt={`Panel ${index + 1}`}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : undefined}
            onError={() => setFailed(true)}
            className="block h-auto w-full animate-fade-in"
            draggable={false}
          />
          <PhotoWatermark variant="edge" />
        </>
      )}
    </div>
  )
}

/** Vertical-scroll reader: panels stack, reading is tracked for analytics. */
export default function ComicReaderPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [ep, setEp] = useState<Episode | null>(null)
  const [next, setNext] = useState<Episode | null>(null)
  const [comicTitle, setComicTitle] = useState<string | null>(null)
  const [readPct, setReadPct] = useState(0)
  const [notFound, setNotFound] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data } = await supabase.from('comic_episodes')
        .select('id, episode_no, title, synopsis, panel_urls, view_count, comic_id, cover_url')
        .eq('id', id)
        .eq('status', 'published')
        .maybeSingle()
      if (!live) return
      if (!data) { setNotFound(true); return }
      setEp(data as Episode)
      if ((data as Episode).comic_id) {
        const { data: comic } = await supabase.from('comics')
          .select('title').eq('id', (data as Episode).comic_id).maybeSingle()
        if (live && comic) setComicTitle((comic as { title: string }).title)
        // Opening an episode marks its series seen, clearing the
        // nav badge for it. No-ops for guests and non-followers.
        fetch('/api/comics/follow', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comicId: (data as Episode).comic_id }),
        }).catch(() => {})
      }
      // Track the open. Reader identity rides the httpOnly
      // intima_reader_id cookie the track route sets, so a reader
      // counts once per episode however often they return.
      fetch('/api/comics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId: id }),
      }).catch(() => {})
      // Next episode inside the same comic (numbers run per series).
      let nextQuery = supabase.from('comic_episodes')
        .select('id, episode_no, title, panel_urls, view_count, cover_url')
        .eq('status', 'published')
        .gt('episode_no', (data as Episode).episode_no)
        .order('episode_no', { ascending: true })
        .limit(1)
      if ((data as Episode).comic_id) {
        nextQuery = nextQuery.eq('comic_id', (data as Episode).comic_id)
      }
      const { data: nx } = await nextQuery.maybeSingle()
      if (live) setNext((nx as unknown as Episode) ?? null)
    })()
    return () => { live = false }
  }, [id])

  // Completion: reader reaches the end marker.
  useEffect(() => {
    const el = endRef.current
    if (!el || !ep) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        fetch('/api/comics/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodeId: id, completed: true }),
        }).catch(() => {})
        io.disconnect()
      }
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [ep, id])

  // Reading progress for the magazine-style progress hairline.
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      setReadPct(max > 0 ? Math.min(1, window.scrollY / max) : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [ep])

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl px-4 pb-20 pt-16 text-center">
        <p className="font-display text-2xl font-semibold text-charcoal">Episode not found</p>
        <Link href="/comics" className="btn-luxe mt-6 inline-flex min-h-[44px] items-center justify-center px-6 py-2.5 text-sm">All comics</Link>
      </div>
    )
  }

  const backHref = ep?.comic_id ? `/comics/series/${ep.comic_id}` : '/comics'
  const firstPanel = ep?.panel_urls?.[0]

  return (
    <div className="mx-auto max-w-2xl pb-24 animate-fade-in">
      {/* Warm the first panel before the reader scrolls to it. */}
      {firstPanel && <link rel="preload" as="image" href={firstPanel} fetchPriority="high" />}

      {/* Reader top bar */}
      <div className="sticky top-0 z-20 border-b border-black/[0.04] bg-cream/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Tooltip label="Back to the comic" side="bottom" align="start">
          <Link href={backHref} aria-label="Back to the comic"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-soft ring-1 ring-black/[0.06] active:scale-95">
            <ArrowLeft aria-hidden className="h-5 w-5 text-charcoal" />
          </Link>
          </Tooltip>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
              {comicTitle ? `${comicTitle} · ` : ''}Episode {ep?.episode_no ?? '…'}
            </p>
            <h1 className="truncate font-display text-lg font-semibold tracking-tight text-charcoal">{ep?.title ?? 'Loading…'}</h1>
          </div>
        </div>
        <div className="h-[3px] bg-black/[0.05]">
          <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${readPct * 100}%` }} />
        </div>
      </div>

      {/* Title plate: the magazine cover page of the episode. */}
      {ep && (
        <div className="relative overflow-hidden bg-[#1A1016] px-6 py-12 text-center">
          {ep.cover_url && (
            <>
              <img src={ep.cover_url} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-25" />
              <div className="absolute inset-0 bg-gradient-to-b from-[#1A1016]/60 via-transparent to-[#1A1016]" />
            </>
          )}
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-gold">{comicTitle ?? 'An Intima comic'}</p>
            <p className="mt-4 font-display text-sm uppercase tracking-[0.3em] text-white/60">Episode {ep.episode_no}</p>
            <h2 className="mx-auto mt-2 max-w-md font-display text-4xl font-semibold leading-tight tracking-tight text-white">{ep.title}</h2>
            {ep.synopsis && (
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/70">{ep.synopsis}</p>
            )}
            <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-white/40">{ep.panel_urls.length} pages · {formatCompactCount(ep.view_count ?? 0)} views</p>
          </div>
        </div>
      )}

      {/* Panels: one consistent column, panels edge to edge with no
          gaps, each in its own dark cell so loading never shifts. */}
      <div className="bg-[#241722] px-2 py-3 sm:px-4">
        <div className="mx-auto w-full max-w-xl overflow-hidden rounded-lg shadow-2xl">
          {ep?.panel_urls.map((src, i) => (
            <PanelImage key={`${i}-${src}`} src={src} index={i} eager={i < 3} />
          ))}
        </div>
      </div>

      <div ref={endRef} className="px-6 pt-10 text-center">
        <div className="mx-auto max-w-sm rounded-[28px] bg-[#1A1016] px-6 py-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-gold">{comicTitle ?? 'Intima Comics'}</p>
          <p className="mt-2 font-display text-2xl italic text-white">The End</p>
          <p className="mt-1.5 text-sm text-white/60">of Episode {ep?.episode_no}. Thanks for reading.</p>
        </div>
        {next ? (
          <Link href={`/comics/${next.id}`} className="btn-luxe mt-6 inline-flex min-h-[44px] items-center gap-1 px-6 py-3 text-sm">
            Next: Episode {next.episode_no} <ChevronRight aria-hidden className="h-4 w-4" />
          </Link>
        ) : (
          <Link href={backHref} className="btn-soft mt-6 inline-flex min-h-[44px] items-center justify-center px-6 py-3 text-sm">Back to the comic</Link>
        )}
        <p className="mt-6 text-xs text-neutral-400">New episodes drop regularly. Follow Intima and you will never miss one.</p>
      </div>
    </div>
  )
}
