'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, ChevronRight } from '@/lib/icons'

interface Episode {
  id: string
  episode_no: number
  title: string
  synopsis: string | null
  panel_urls: string[]
  view_count: number
  source_name: string | null
  source_link: string | null
}

/** Vertical-scroll reader: panels stack, reading is tracked for analytics. */
export default function ComicReaderPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [ep, setEp] = useState<Episode | null>(null)
  const [next, setNext] = useState<Episode | null>(null)
  const [notFound, setNotFound] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const viewerKey = () => {
    try {
      let k = localStorage.getItem('intima_viewer_key')
      if (!k) {
        k = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
        localStorage.setItem('intima_viewer_key', k)
      }
      return k
    } catch {
      return 'v_' + Math.random().toString(36).slice(2)
    }
  }

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data } = await supabase.from('comic_episodes')
        .select('id, episode_no, title, synopsis, panel_urls, view_count, source_name, source_link')
        .eq('id', id)
        .eq('status', 'published')
        .maybeSingle()
      if (!live) return
      if (!data) { setNotFound(true); return }
      setEp(data as Episode)
      // Track the open (deduped per viewer server-side).
      fetch('/api/comics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId: id, viewerKey: viewerKey() }),
      }).catch(() => {})
      // Next episode (lower number = older, higher = newer).
      const { data: nx } = await supabase.from('comic_episodes')
        .select('id, episode_no, title, panel_urls, view_count')
        .eq('status', 'published')
        .gt('episode_no', (data as Episode).episode_no)
        .order('episode_no', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (live) setNext((nx as Episode) ?? null)
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
          body: JSON.stringify({ episodeId: id, viewerKey: viewerKey(), completed: true }),
        }).catch(() => {})
        io.disconnect()
      }
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [ep, id])

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl px-4 pb-20 pt-16 text-center">
        <p className="font-display text-2xl font-semibold text-charcoal">Episode not found</p>
        <Link href="/comics" className="btn-luxe mt-6 px-6 py-2.5 text-sm">All episodes</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl pb-24 animate-fade-in">
      {/* Reader top bar */}
      <div className="sticky top-0 z-20 border-b border-black/[0.04] bg-cream/85 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link href="/comics" aria-label="Back to episodes"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-soft ring-1 ring-black/[0.06] active:scale-95">
            <ArrowLeft className="h-5 w-5 text-charcoal" />
          </Link>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Episode {ep?.episode_no ?? '…'}</p>
            <h1 className="truncate font-display text-lg font-semibold tracking-tight text-charcoal">{ep?.title ?? 'Loading…'}</h1>
          </div>
        </div>
      </div>

      {/* Panels */}
      <div className="bg-charcoal">
        {ep?.panel_urls.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={`Panel ${i + 1}`}
            loading={i < 2 ? 'eager' : 'lazy'}
            className="w-full animate-fade-in"
            draggable={false}
          />
        ))}
      </div>

      <div ref={endRef} className="px-6 pt-10 text-center">
        <p className="font-display text-xl italic text-neutral-500">End of episode</p>
        {next ? (
          <Link href={`/comics/${next.id}`} className="btn-luxe mt-6 inline-flex items-center gap-1 px-6 py-3 text-sm">
            Next: Episode {next.episode_no} <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <Link href="/comics" className="btn-soft mt-6 inline-flex px-6 py-3 text-sm">All episodes</Link>
        )}
        <p className="mt-6 text-xs text-neutral-400">New episodes drop regularly. Follow Intima and you will never miss one.</p>
        {ep?.source_name && (
          <p className="mt-2 text-[11px] text-neutral-400">
            Source: {ep.source_link ? (
              <a href={ep.source_link} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary">{ep.source_name}</a>
            ) : (
              <span className="font-semibold">{ep.source_name}</span>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
