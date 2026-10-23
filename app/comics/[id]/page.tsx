'use client'

import { formatCompactCount } from '@/lib/utils/helpers'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, ChevronRight, ChevronUp } from '@/lib/icons'
import { Tooltip } from '@/components/ui/Tooltip'
import { watermarkText } from '@/lib/site'
import { getSetting } from '@/lib/settings/platformSettings'
import { prefetchPanels, isSaveData } from '@/lib/comics/prefetch'

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
 * One stable reader hint per browser, shared by every tracking ping
 * on this page. The track route adopts it as the guest identity
 * until its own httpOnly reader cookie exists, which is what stops
 * two pings from one visit minting two readers. Cached in a module
 * variable first so even a browser that refuses storage still uses
 * a single hint for the whole page load.
 */
let hintCache: string | null = null
function readerHint(): string {
  if (hintCache) return hintCache
  try {
    hintCache = window.localStorage.getItem('intima_reader_hint')
  } catch {
    /* storage refused: the module cache still covers this load */
  }
  if (!hintCache) {
    const rand =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36)
    hintCache = `r_${rand}`
    try {
      window.localStorage.setItem('intima_reader_hint', hintCache)
    } catch {
      /* best effort */
    }
  }
  return hintCache
}

/**
 * Panels render to a CANVAS, never an <img> (owner rule,
 * 2026-10-23): a long press must not offer "save image", and the
 * watermark is painted INTO the pixels at the lower centre, the
 * same line photos carry, so any copy of a page, screenshot or
 * otherwise, shows where it lives. A DOM overlay watermark did
 * neither: it stayed behind when the raw file was saved. The
 * canvas is display-only; nothing here ever exports it.
 */
function PanelImage({ src, index, watermark }: { src: string; index: number; watermark: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const liveSrc = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}cb=${attempt}`

  useEffect(() => {
    let live = true
    setFailed(false)
    setLoaded(false)
    const img = new Image()
    img.onload = () => {
      if (!live) return
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx || img.naturalWidth === 0) { setFailed(true); return }
      // Cap the bitmap at 1000px wide: the column never displays
      // wider than 576 CSS px, so this stays visually lossless
      // while keeping a long episode's memory sane.
      const scale = Math.min(1, 1000 / img.naturalWidth)
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)
      canvas.width = w
      canvas.height = h
      ctx.drawImage(img, 0, 0, w, h)
      const text = (watermark || '').trim().toLowerCase()
      if (text) {
        const fs = Math.max(13, Math.round(w * 0.026))
        ctx.font = `600 ${fs}px system-ui, -apple-system, 'Segoe UI', sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        try {
          ;(ctx as unknown as { letterSpacing?: string }).letterSpacing = `${Math.max(2, Math.round(fs * 0.22))}px`
        } catch { /* older engines: spacing is cosmetic */ }
        ctx.shadowColor = 'rgba(0,0,0,0.7)'
        ctx.shadowBlur = 8
        ctx.shadowOffsetY = 1
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.fillText(text, w / 2, Math.round(h * 0.87))
      }
      setLoaded(true)
    }
    img.onerror = () => { if (live) setFailed(true) }
    img.src = liveSrc
    return () => { live = false }
  }, [liveSrc, watermark])

  return (
    <div
      className={`relative w-full select-none bg-[#171017] [-webkit-touch-callout:none] ${loaded || failed ? '' : 'min-h-[320px]'}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {failed ? (
        <button
          type="button"
          onClick={() => setAttempt((a) => a + 1)}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 px-6 text-center"
        >
          <span className="font-display text-base font-semibold text-white/85">This page could not load</span>
          <span className="text-sm font-medium text-gold">Tap to retry</span>
        </button>
      ) : (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Panel ${index + 1}`}
          className={`block h-auto w-full transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
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
  const [panelsReady, setPanelsReady] = useState(false)
  const [gateCount, setGateCount] = useState(0)
  // The watermark line painted into every panel: the admin's
  // custom line when one is set, else the live domain, exactly
  // like the photo watermark.
  const [wmText, setWmText] = useState(() => watermarkText())
  useEffect(() => {
    let live = true
    getSetting<string>('watermark_text', '').then((custom) => {
      if (!live) return
      const base = typeof custom === 'string' ? custom.trim() : ''
      if (base) setWmText(base)
    }).catch(() => {})
    return () => { live = false }
  }, [])
  const [notFound, setNotFound] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const latestPctRef = useRef(0)
  const sentDecileRef = useRef(0)
  const supabase = createClient()

  // Read strength reporting: as the reader crosses each tenth of
  // the episode, save the fraction on this device (the series page
  // draws its bars from it instantly) and ping the track route,
  // which stores the furthest point server-side too. A final flush
  // on pagehide catches wherever the reader actually stopped.
  function persistProgress(frac: number) {
    const pctInt = Math.round(frac * 100)
    if (pctInt < 1) return
    try {
      const raw = window.localStorage.getItem('intima_episode_progress')
      const map = (raw ? JSON.parse(raw) : {}) as Record<string, number>
      if (pctInt > (map[id] ?? 0)) {
        map[id] = pctInt
        window.localStorage.setItem('intima_episode_progress', JSON.stringify(map))
      }
    } catch { /* storage refused: the server ping still carries it */ }
    fetch('/api/comics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ episodeId: id, progress: frac, viewerKey: readerHint() }),
    }).catch(() => {})
  }

  useEffect(() => {
    // A fresh episode starts from a clean slate: no stale panels from
    // the previous episode, and the load gate closes again.
    setEp(null)
    setNext(null)
    setPanelsReady(false)
    setGateCount(0)
    setNotFound(false)
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
      // counts once per episode however often they return. Every
      // ping also carries the reader hint: the completion ping can
      // fire before the cookie from this response comes back, and
      // without a shared hint the route would mint a second reader
      // for the same visit (proven live: two opens counted 2).
      fetch('/api/comics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId: id, viewerKey: readerHint() }),
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

  // Load gate (owner rule, 2026-10-23): the episode page does
  // not open until EVERY panel has fully loaded, so nobody
  // starts scrolling and meets an empty page halfway down. A
  // panel that fails still counts as settled: it shows its own
  // retry tile in place, it never traps the whole episode. The
  // preparing state counts the pages out loud so a long episode
  // on a slow network reads as progress, not a hang. Panels are
  // cached after the first read, so a return visit passes this
  // gate almost instantly.
  useEffect(() => {
    if (!ep) return
    const urls = ep.panel_urls
    if (urls.length === 0) { setPanelsReady(true); return }
    let live = true
    let done = 0
    setGateCount(0)
    Promise.allSettled(
      urls.map((u) => new Promise<boolean>((resolve) => {
        const img = new Image()
        const settle = (ok: boolean) => {
          if (live) {
            done += 1
            setGateCount(done)
          }
          resolve(ok)
        }
        img.onload = () => settle(true)
        img.onerror = () => settle(false)
        img.src = u
      })),
    ).then(() => {
      if (live) setPanelsReady(true)
    })
    return () => { live = false }
  }, [ep])

  // Background loading: once the first screen is ready, pull the
  // whole episode down in reading order, then the next episode
  // behind it, so scrolling never waits on the network. The queue
  // lives at module level (lib/comics/prefetch), so stepping into
  // the next episode finds its pages already on the device. A
  // data-saver connection still gets the current episode, just not
  // the speculative next one.
  useEffect(() => {
    if (!panelsReady || !ep) return
    prefetchPanels(ep.panel_urls)
    if (next && !isSaveData()) prefetchPanels(next.panel_urls)
  }, [panelsReady, ep, next])

  // Completion: reader reaches the end marker. The observer arms
  // only once the panels are actually on screen: before that the
  // page is just the title plate and the preparing placeholder, so
  // short that the end marker can sit inside the first viewport and
  // an episode would count as finished the moment it opens.
  useEffect(() => {
    const el = endRef.current
    if (!el || !ep || !panelsReady) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        fetch('/api/comics/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodeId: id, completed: true, viewerKey: readerHint() }),
        }).catch(() => {})
        io.disconnect()
      }
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [ep, id, panelsReady])

  // Reading progress for the magazine-style progress hairline,
  // plus the read-strength reporting: crossing a new tenth of the
  // episode persists the fraction (see persistProgress).
  useEffect(() => {
    latestPctRef.current = 0
    sentDecileRef.current = 0
    const onScroll = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      const pct = max > 0 ? Math.min(1, window.scrollY / max) : 0
      setReadPct(pct)
      latestPctRef.current = pct
      const decile = Math.floor(pct * 10)
      if (decile > sentDecileRef.current && pct > 0 && pct < 1) {
        sentDecileRef.current = decile
        persistProgress(pct)
      }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ep])

  // Final flush when the reader leaves mid-episode.
  useEffect(() => {
    const flush = () => {
      const pct = latestPctRef.current
      if (pct > 0 && pct < 1) persistProgress(pct)
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl px-4 pb-20 pt-16 text-center">
        <p className="font-display text-2xl font-semibold text-charcoal">Episode not found</p>
        <Link href="/comics" className="btn-luxe mt-6 inline-flex min-h-[44px] items-center justify-center px-6 py-2.5 text-sm">All comics</Link>
      </div>
    )
  }

  const backHref = ep?.comic_id ? `/comics/series/${ep.comic_id}` : '/comics'
  const firstPanels = ep?.panel_urls?.slice(0, 3) ?? []

  return (
    <div className="mx-auto max-w-2xl pb-24 animate-fade-in">
      {/* Warm the first screen of panels before the reader scrolls. */}
      {firstPanels.map((p) => (
        <link key={p} rel="preload" as="image" href={p} fetchPriority="high" />
      ))}

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
              <img src={ep.cover_url} alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover opacity-25" />
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
          gaps, each in its own dark cell so loading never shifts.
          The column waits behind a clean preparing state until the
          first screen of panels has fully loaded. */}
      <div className="bg-[#241722] px-2 py-3 sm:px-4">
        {ep && !panelsReady ? (
          <div className="mx-auto flex w-full max-w-xl flex-col items-center justify-center gap-3 rounded-lg bg-[#171017] px-6 py-24 text-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-gold" />
            <p className="font-display text-base font-semibold text-white/85">Preparing your pages</p>
            <p className="max-w-xs text-sm text-white/50">
              Your episode opens when every page is fully loaded, so you never scroll into an empty one.
              {ep.panel_urls.length > 0 && (
                <span className="mt-1 block font-semibold text-white/70">{gateCount} of {ep.panel_urls.length} pages ready</span>
              )}
            </p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-xl select-none overflow-hidden rounded-lg shadow-2xl">
            {ep?.panel_urls.map((src, i) => (
              <PanelImage key={`${i}-${src}`} src={src} index={i} watermark={wmText} />
            ))}
          </div>
        )}
      </div>

      {/* Back to top: appears once the reader is deep in the episode. */}
      {panelsReady && readPct > 0.2 && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to the top of this episode"
          className="fixed bottom-28 right-4 z-30 inline-flex h-12 items-center gap-1.5 rounded-full bg-charcoal/90 px-4 text-xs font-semibold text-white shadow-xl ring-1 ring-white/15 backdrop-blur transition active:scale-95"
        >
          <ChevronUp aria-hidden className="h-4 w-4" /> Top
        </button>
      )}

      {/* The End block waits for the panels too: shown early it
          spoils the ending and arms the completion sensor on a
          page that is still just a placeholder. */}
      {ep && panelsReady && (
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
      )}
    </div>
  )
}
