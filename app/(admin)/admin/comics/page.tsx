'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Plus, Send, Trash2, Eye, CheckCircle2, ArrowLeft } from '@/lib/icons'
import { formatCompactCount } from '@/lib/utils/helpers'
import { HelpTip } from '@/components/ui/Tooltip'

interface Comic {
  id: string
  title: string
  synopsis: string
  cover_url: string | null
  status: string
  story_status?: string
  is_featured?: boolean
}

// Select value meaning "the fetched page is a new comic": the
// import creates it from the preview first, then fills it.
const NEW_TARGET = '__new__'

type PagePreview =
  | { kind: 'series'; title: string; storyStatus: string | null; relay?: boolean; coverUrl?: string | null; chapters: Array<{ no: number; url: string; label: string }> }
  | { kind: 'episode'; title: string; storyStatus: string | null; relay?: boolean; images: Array<{ url: string; keep: boolean; reason: string | null }> }

interface Episode {
  id: string
  episode_no: number
  title: string
  status: 'draft' | 'published'
  published_at: string | null
  view_count: number
  comic_id: string | null
}

/**
 * Admin: Comics hold episodes. Create a comic (series) first,
 * then add episodes to it. Publishing an episode fans out a push.
 * Built mobile-first: every row wraps instead of overflowing.
 */
export default function AdminComicsPage() {
  const [comics, setComics] = useState<Comic[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [stats, setStats] = useState<Record<string, { readers: number; completed: number }>>({})
  const [loading, setLoading] = useState(true)
  const [seriesTitle, setSeriesTitle] = useState('')
  const [seriesSynopsis, setSeriesSynopsis] = useState('')
  const [seriesCover, setSeriesCover] = useState('')
  const [comicId, setComicId] = useState('')
  const [title, setTitle] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [panels, setPanels] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmPublishAll, setConfirmPublishAll] = useState(false)
  const [publishingAll, setPublishingAll] = useState(false)
  const [feedUrl, setFeedUrl] = useState('')
  const [preview, setPreview] = useState<{ name: string; items: Array<{ guid: string; title: string; images: string[] }> } | null>(null)
  const [feeds, setFeeds] = useState<Array<{ id: string; name: string; url: string }>>([])
  const [seriesStatus, setSeriesStatus] = useState<'ongoing' | 'completed'>('ongoing')
  const [linkUrl, setLinkUrl] = useState('')
  const [pagePreview, setPagePreview] = useState<PagePreview | null>(null)
  const [pageKeep, setPageKeep] = useState<Record<string, boolean>>({})
  const [chapterKeep, setChapterKeep] = useState<Record<number, boolean>>({})
  const [importLog, setImportLog] = useState<string[]>([])
  const [importing, setImporting] = useState(false)

  async function load() {
    const res = await fetch('/api/admin/comics')
    const d = await res.json()
    if (res.ok) {
      setComics(d.comics ?? [])
      setEpisodes(d.episodes ?? [])
      setStats(d.stats ?? {})
      if (!comicId && (d.comics ?? []).length > 0) setComicId(d.comics[0].id)
    }
    setLoading(false)
  }

  useEffect(() => { load(); loadFeeds() }, [])

  async function loadFeeds() {
    const res = await fetch('/api/admin/comics/import')
    const d = await res.json()
    if (res.ok) setFeeds(d.feeds ?? [])
  }

  async function previewFeed() {
    setBusy(true); setMsg('')
    const res = await fetch('/api/admin/comics/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', url: feedUrl.trim() }),
    })
    const d = await res.json()
    setBusy(false)
    if (res.ok) setPreview(d); else setMsg(d.error ?? 'Could not read that feed.')
  }

  async function addFeed() {
    const res = await fetch('/api/admin/comics/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add-feed', url: feedUrl.trim() }),
    })
    const d = await res.json()
    if (res.ok) { setFeeds(d.feeds); setMsg('Feed added. New episodes auto-publish daily.') }
    else setMsg(d.error ?? 'Could not add that feed.')
  }

  async function removeFeed(id: string) {
    const res = await fetch('/api/admin/comics/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove-feed', id }),
    })
    const d = await res.json()
    if (res.ok) setFeeds(d.feeds)
  }

  async function importItem(guid: string) {
    setBusy(true)
    const res = await fetch('/api/admin/comics/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'import', feedUrl: feedUrl.trim(), feedName: preview?.name, guid }),
    })
    const d = await res.json()
    setBusy(false)
    if (res.ok) { setMsg(`Imported as Episode ${d.episode.episode_no} (draft). Publish when ready.`); load() }
    else setMsg(d.error ?? 'Import failed.')
  }

  async function createSeries() {
    setBusy(true); setMsg('')
    const res = await fetch('/api/admin/comics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        series: {
          title: seriesTitle.trim(),
          synopsis: seriesSynopsis.trim(),
          coverUrl: seriesCover.trim(),
          storyStatus: seriesStatus,
        },
      }),
    })
    const d = await res.json()
    setBusy(false)
    if (res.ok) {
      setSeriesTitle(''); setSeriesSynopsis(''); setSeriesCover('')
      setComicId(d.comic.id)
      setMsg(`Comic "${d.comic.title}" created. Now add its first episode below.`)
      load()
    } else {
      setMsg(d.error ?? 'Could not create the comic.')
    }
  }

  async function fetchPagePreview() {
    setBusy(true); setMsg(''); setImportLog([]); setPagePreview(null)
    const res = await fetch('/api/admin/comics/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'page-preview', url: linkUrl.trim() }),
    })
    const d = await res.json()
    setBusy(false)
    if (!res.ok) { setMsg(d.error ?? 'Could not read that page.'); return }
    setPagePreview(d)
    if (d.kind === 'episode') {
      const keep: Record<string, boolean> = {}
      for (const img of d.images) keep[img.url] = img.keep
      setPageKeep(keep)
      // A single chapter belongs to a comic that already exists;
      // never let a leftover new-comic target from a series
      // preview create a comic named after one chapter.
      if (comicId === NEW_TARGET) setComicId(comics[0]?.id ?? '')
    }
    if (d.kind === 'series') {
      const keep: Record<number, boolean> = {}
      for (const ch of d.chapters) keep[ch.no] = true
      setChapterKeep(keep)
      // Work out whose episodes these are without being told: a
      // shelf comic with the same title is the target. No match
      // means this page is a NEW comic, so the target becomes
      // create-on-import instead of whichever comic happened to
      // sit first in the list (owner catch, 2026-10-24: a fetched
      // "Gisela" was about to pour 25 episodes into the unrelated
      // comic that was selected by default).
      const wanted = (d.title ?? '').trim().toLowerCase()
      const match = comics.find((c) => c.title.trim().toLowerCase() === wanted)
      setComicId(match ? match.id : NEW_TARGET)
    }
  }

  async function importPageEpisode(url: string, title: string, keep: string[] | undefined, targetId: string) {
    const res = await fetch('/api/admin/comics/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'page-import', url, comicId: targetId, title, keep }),
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error ?? 'Import failed.')
    return d
  }

  async function importFromPreview() {
    if (!pagePreview || !comicId) return
    setImporting(true); setImportLog([])
    try {
      // A new-comic target is created from the preview first
      // (title plus the source's story status), then the import
      // fills it like any other comic.
      let targetId = comicId
      const leadLog: string[] = []
      if (comicId === NEW_TARGET) {
        const cres2 = await fetch('/api/admin/comics', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ series: { title: pagePreview.title, storyStatus: pagePreview.storyStatus === 'completed' ? 'completed' : 'ongoing' } }),
        })
        const cd2 = await cres2.json().catch(() => ({}))
        if (!cres2.ok || !cd2.comic?.id) {
          setMsg(cd2.error ?? 'Could not create the new comic.')
          return
        }
        targetId = cd2.comic.id as string
        setComicId(targetId)
        leadLog.push(`Created the new comic “${pagePreview.title}”.`)
        setImportLog([...leadLog])
      }
      if (pagePreview.kind === 'episode') {
        const keep = pagePreview.images.filter((i) => pageKeep[i.url]).map((i) => i.url)
        const d = await importPageEpisode(linkUrl.trim(), pagePreview.title, keep, targetId)
        setMsg(`Imported as Episode ${d.episode.episode_no} (draft), ${d.panels} panels served through our CDN. Publish when ready.`)
        setPagePreview(null)
      } else {
        const picked = pagePreview.chapters.filter((c) => chapterKeep[c.no])
        const log: string[] = [...leadLog]
        let okCount = 0
        try {
          const cres = await fetch('/api/admin/comics/import', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'set-cover', comicId: targetId, seriesUrl: linkUrl.trim() }),
          })
          const cd = await cres.json().catch(() => ({}))
          if (cres.ok && cd.alreadySet) log.push('This comic already has a cover, so the series page cover was skipped.')
          else if (cres.ok) log.push('Cover pulled from the series page and saved to this comic.')
          else log.push('No cover could be pulled from the series page. The import continues without one.')
        } catch {
          log.push('No cover could be pulled from the series page. The import continues without one.')
        }
        setImportLog([...log])
        for (const ch of picked) {
          log.push(`Importing ${ch.no}. ${ch.label}…`)
          setImportLog([...log])
          try {
            const d = await importPageEpisode(ch.url, ch.label, undefined, targetId)
            log[log.length - 1] = `Done: ${ch.no}. ${ch.label} became Episode ${d.episode.episode_no} (${d.panels} panels).`
            okCount += 1
          } catch (e) {
            log[log.length - 1] = `Skipped ${ch.no}. ${ch.label}: ${e instanceof Error ? e.message : 'failed'}`
          }
          setImportLog([...log])
        }
        setMsg(`Series import finished: ${okCount} of ${picked.length} episodes landed as drafts.`)
        if (okCount > 0) setPagePreview(null)
      }
      load()
    } finally {
      setImporting(false)
    }
  }

  async function setFeatured(id: string, featured: boolean) {
    const res = await fetch('/api/admin/comics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seriesFeature: { id, featured } }),
    })
    if (res.ok) load()
  }

  async function createFromPreview() {
    if (!pagePreview) return
    setBusy(true); setMsg('')
    const res = await fetch('/api/admin/comics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ series: { title: pagePreview.title, storyStatus: pagePreview.storyStatus === 'completed' ? 'completed' : 'ongoing' } }),
    })
    const d = await res.json()
    setBusy(false)
    if (res.ok && d.comic?.id) {
      setComicId(d.comic.id)
      setMsg(`Comic created: ${pagePreview.title}. The import button below is ready now.`)
      load()
    } else {
      setMsg(d.error ?? 'Could not create the comic.')
    }
  }

  async function setStoryStatus(id: string, storyStatus: 'ongoing' | 'completed') {
    const res = await fetch('/api/admin/comics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seriesStatusUpdate: { id, storyStatus } }),
    })
    if (res.ok) load()
  }

  async function create() {
    setBusy(true); setMsg('')
    const res = await fetch('/api/admin/comics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        synopsis: synopsis.trim(),
        comicId: comicId && comicId !== NEW_TARGET ? comicId : undefined,
        panelUrls: panels.split('\n').map((u) => u.trim()).filter(Boolean),
      }),
    })
    const d = await res.json()
    setBusy(false)
    if (res.ok) {
      setTitle(''); setSynopsis(''); setPanels('')
      setMsg(`Episode ${d.episode.episode_no} created as a draft.`)
      load()
    } else {
      setMsg(d.error ?? 'Could not create episode.')
    }
  }

  async function patch(id: string, action: 'publish' | 'unpublish') {
    const res = await fetch('/api/admin/comics', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    if (res.ok) {
      setMsg(action === 'publish' ? 'Published. Every subscriber got a push.' : 'Unpublished.')
      load()
    }
  }

  async function publishAll() {
    // Two-tap confirm in our own UI, never a system dialog.
    if (!confirmPublishAll) {
      setConfirmPublishAll(true)
      return
    }
    setConfirmPublishAll(false)
    setPublishingAll(true)
    try {
      const res = await fetch('/api/admin/comics', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish-all' }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setMsg(d.published > 0 ? `Published ${d.published} episodes. Followers got one notice per series.` : 'No drafts waiting.')
        load()
      } else {
        setMsg(d.error ?? 'Could not publish the drafts.')
      }
    } finally {
      setPublishingAll(false)
    }
  }

  async function remove(id: string) {
    // Two-tap confirm in our own UI, never a system dialog.
    if (confirmDelete !== id) {
      setConfirmDelete(id)
      return
    }
    setConfirmDelete(null)
    await fetch(`/api/admin/comics?id=${id}`, { method: 'DELETE' })
    load()
  }

  const totals = episodes.reduce(
    (a, e) => ({
      views: a.views + (e.view_count ?? 0),
      readers: a.readers + (stats[e.id]?.readers ?? 0),
      completed: a.completed + (stats[e.id]?.completed ?? 0),
    }),
    { views: 0, readers: 0, completed: 0 }
  )

  const comicTitle = (cid: string | null) =>
    comics.find((c) => c.id === cid)?.title ?? 'No comic'

  const draftCount = episodes.filter((e) => e.status === 'draft').length

  return (
    <div className="mx-auto max-w-4xl px-0 pb-16 pt-2 sm:px-4 sm:pt-6">
      <Link href="/admin" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-neutral-500 hover:text-primary">
        <ArrowLeft aria-hidden className="h-4 w-4" /> Admin
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-muted">
          <BookOpen aria-hidden className="h-5 w-5 text-primary" />
        </span>
        <div className="min-w-0">
          <h1 className="t-page-title text-charcoal">Comics</h1>
          <p className="text-sm text-neutral-500">A comic holds episodes. You post them, readers come back.</p>
        </div>
      </div>

      {/* Analytics strip */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { label: 'Total reads', value: totals.views },
          { label: 'Unique readers', value: totals.readers },
          { label: 'Completions', value: totals.completed },
        ].map((s) => (
          <div key={s.label} className="card-luxe min-w-0 p-3 text-center sm:p-4">
            <p className="truncate font-display text-2xl font-semibold text-charcoal sm:text-3xl">{formatCompactCount(s.value)}</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* New comic (series) */}
      <div className="card-luxe mt-6 p-5">
        <h2 className="t-section-title text-charcoal">New comic</h2>
        <p className="mt-1 text-xs text-neutral-500">A comic is the series on the shelf. Episodes live inside it.</p>
        <div className="mt-4 space-y-3">
          <input value={seriesTitle} onChange={(e) => setSeriesTitle(e.target.value)} placeholder="Comic title, e.g. Lekki Nights"
            className="min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base outline-none focus:border-primary md:text-sm" />
          <textarea value={seriesSynopsis} onChange={(e) => setSeriesSynopsis(e.target.value)} placeholder="What is this comic about? (optional)"
            rows={2} className="min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base outline-none focus:border-primary md:text-sm" />
          <input value={seriesCover} onChange={(e) => setSeriesCover(e.target.value)} placeholder="Cover image URL (optional, the latest episode cover is used otherwise)"
            className="min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base outline-none focus:border-primary md:text-sm" />
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-neutral-500">Story status
              <HelpTip text="Ongoing means new episodes are still coming. Completed means the story has ended. Readers see this badge on the shelf." />
            </span>
            <select value={seriesStatus} onChange={(e) => setSeriesStatus(e.target.value as 'ongoing' | 'completed')}
              className="min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base outline-none focus:border-primary md:text-sm">
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <button onClick={createSeries} disabled={busy || !seriesTitle.trim()} className="btn-luxe min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50">
            <Plus aria-hidden className="h-4 w-4" /> {busy ? 'Creating…' : 'Create comic'}
          </button>
        </div>
        {comics.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <HelpTip text="Featuring puts one comic first on the shelf, in the big banner, so readers see it before everything else. Only one comic holds the spot at a time." />
            {comics.map((c) => (
              <span key={c.id} className="inline-flex min-h-[44px] max-w-full flex-wrap items-center gap-2 rounded-2xl bg-cream px-3 py-1.5 text-xs font-medium text-charcoal ring-1 ring-black/[0.05] sm:rounded-full">
                <span className="min-w-0 truncate">{c.title} · {episodes.filter((e) => e.comic_id === c.id).length} episodes</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.story_status === 'completed' ? 'bg-neutral-200 text-neutral-600' : 'bg-[#C9A84C]/25 text-[#8a6d2a]'}`}>
                  {c.story_status === 'completed' ? 'Completed' : 'Ongoing'}
                </span>
                <select
                  aria-label={`Story status for ${c.title}`}
                  value={c.story_status === 'completed' ? 'completed' : 'ongoing'}
                  onChange={(e) => setStoryStatus(c.id, e.target.value as 'ongoing' | 'completed')}
                  className="min-h-[44px] rounded-full bg-transparent text-[11px] font-semibold text-primary outline-none"
                >
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                </select>
                <button
                  type="button"
                  onClick={() => setFeatured(c.id, !c.is_featured)}
                  aria-pressed={!!c.is_featured}
                  className={`min-h-[44px] rounded-full px-2.5 text-[11px] font-bold ${c.is_featured ? 'bg-[#C9A84C] text-charcoal' : 'bg-black/[0.05] text-neutral-500'}`}
                >
                  {c.is_featured ? 'Featured' : 'Feature'}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* New episode */}
      <div className="card-luxe mt-6 p-5">
        <h2 className="t-section-title text-charcoal">New episode</h2>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-500">Comic</span>
            <select value={comicId === NEW_TARGET ? '' : comicId} onChange={(e) => setComicId(e.target.value)}
              className="min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base outline-none focus:border-primary md:text-sm">
              {comics.length === 0 && <option value="">No comics yet, create one above</option>}
              {comics.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Episode title"
            className="min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base outline-none focus:border-primary md:text-sm" />
          <textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} placeholder="Synopsis (optional)"
            rows={2} className="min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base outline-none focus:border-primary md:text-sm" />
          <textarea value={panels} onChange={(e) => setPanels(e.target.value)} placeholder={'Panel image URLs, one per line, in reading order'}
            rows={5} className="min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 font-mono text-base outline-none focus:border-primary md:text-sm" />
          <button onClick={create} disabled={busy || !title.trim()} className="btn-luxe min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50">
            <Plus aria-hidden className="h-4 w-4" /> {busy ? 'Creating…' : 'Create draft'}
          </button>
          {msg && <p className="text-xs text-neutral-600">{msg}</p>}
        </div>
      </div>

      {/* Feed import */}
      <div className="card-luxe mt-6 p-5">
        <h2 className="t-section-title text-charcoal">Import from a feed</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Paste an RSS feed URL from a comic you own or are licensed to republish.
          Add it as a feed and new episodes publish automatically each day, with credit to the source.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="https://example.com/feed.xml"
            className="min-h-[44px] min-w-0 flex-1 rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base outline-none focus:border-primary md:text-sm" />
          <div className="flex gap-2">
            <button onClick={previewFeed} disabled={busy || !feedUrl.trim()} className="btn-soft min-h-[44px] flex-1 px-4 py-2.5 text-sm disabled:opacity-50 sm:flex-none">Preview</button>
            <button onClick={addFeed} disabled={busy || !feedUrl.trim()} className="btn-luxe min-h-[44px] flex-1 px-4 py-2.5 text-sm disabled:opacity-50 sm:flex-none">Add feed</button>
          </div>
        </div>
        {feeds.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {feeds.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 rounded-xl bg-cream px-3 py-2 text-xs">
                <span className="min-w-0 truncate"><span className="font-semibold text-charcoal">{f.name}</span> · <span className="text-neutral-500">{f.url}</span></span>
                <button onClick={() => removeFeed(f.id)} className="inline-flex min-h-[44px] shrink-0 items-center px-2 font-semibold text-red-500">Remove</button>
              </div>
            ))}
          </div>
        )}
        {preview && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-neutral-500">{preview.name}: {preview.items.length} items found</p>
            {preview.items.slice(0, 12).map((i) => (
              <div key={i.guid} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-charcoal">{i.title}</span>
                <span className="shrink-0 text-[11px] text-neutral-400">{i.images.length} panels</span>
                <button onClick={() => importItem(i.guid)} disabled={busy || i.images.length === 0} className="btn-luxe min-h-[44px] shrink-0 px-3 py-1.5 text-xs disabled:opacity-50">Import</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Page-link import */}
      <div className="card-luxe mt-6 p-5">
        <h2 className="flex items-center gap-2 t-section-title text-charcoal">Import from a page link
          <HelpTip text="Paste a chapter link to bring in that one episode, or a series link to bring in every episode in order. Panels are served through our own image CDN, so readers load everything from Intima, fast. Everything lands as drafts." />
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Only import comics you own or are licensed to republish. Logos, banners and other site decoration are filtered out on their own; you can untick anything else in the preview.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.com/comic/series-name or one chapter link"
            className="min-h-[44px] min-w-0 flex-1 rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base outline-none focus:border-primary md:text-sm" />
          <button onClick={fetchPagePreview} disabled={busy || importing || !linkUrl.trim()} className="btn-luxe min-h-[44px] px-4 py-2.5 text-sm disabled:opacity-50">Fetch</button>
        </div>
        <label className="mt-3 block">
          {pagePreview && comics.length === 0 && (
            <div className="mb-3 rounded-2xl bg-[#C9A84C]/15 p-3.5">
              <p className="text-xs leading-relaxed text-charcoal">There is no comic yet to receive these episodes, which is why the import button below stays off.</p>
              <button type="button" onClick={createFromPreview} disabled={busy} className="btn-luxe mt-2.5 min-h-[44px] max-w-full whitespace-normal break-words px-4 py-2 text-left text-sm disabled:opacity-50">
                Create “{pagePreview.title}” as a new comic
              </button>
            </div>
          )}
          <span className="mb-1 block text-xs font-semibold text-neutral-500">Episodes go into this comic</span>
          <select value={comicId} onChange={(e) => setComicId(e.target.value)}
            className="min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base outline-none focus:border-primary md:text-sm">
            {comics.length === 0 && <option value="">No comics yet, create one above</option>}
            {pagePreview?.kind === 'series' && (
              <option value={NEW_TARGET}>New comic: “{pagePreview.title}” (created on import)</option>
            )}
            {comics.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </label>
        {pagePreview?.kind === 'series' && comicId === NEW_TARGET && (
          <p className="mt-2 rounded-xl bg-[#C9A84C]/15 px-3 py-2 text-xs leading-relaxed text-charcoal">
            “{pagePreview.title}” is not on the shelf yet, so the target is a new comic. Importing creates it first, with the source’s story status, then adds these episodes as drafts.
          </p>
        )}
        {pagePreview?.kind === 'series' && comicId !== NEW_TARGET && (() => {
          const sel = comics.find((c) => c.id === comicId)
          return sel && sel.title.trim().toLowerCase() !== pagePreview.title.trim().toLowerCase() ? (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-100">
              Careful: this page is “{pagePreview.title}”, but the episodes will land in “{sel.title}”, and that comic will take the source’s story status too. If “{pagePreview.title}” is its own comic, pick the New comic option above instead.
            </p>
          ) : null
        })()}
        {pagePreview && pagePreview.kind === 'series' && (
          <div className="mt-4 space-y-2">
            <p className="break-words text-sm font-semibold text-charcoal">{pagePreview.title}</p>
            {pagePreview.coverUrl && (
              <div className="flex items-center gap-3">
                <img src={pagePreview.coverUrl} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover ring-1 ring-black/10" />
                <p className="text-xs text-neutral-500">Cover found on the series page. It saves to the comic automatically when the import starts, through our CDN.</p>
              </div>
            )}
            {pagePreview.relay && (
              <p className="text-xs font-medium text-[#8a6d2a]">That site would not answer our server directly, so the page was read through a relay. The panels themselves still come from the source through our CDN.</p>
            )}
            <p className="text-xs text-neutral-500">
              {pagePreview.chapters.length} episodes found, in reading order.
              {pagePreview.storyStatus ? ` The source lists this comic as ${pagePreview.storyStatus === 'completed' ? 'Completed' : 'Ongoing'}; importing will set that here too.` : ''}
            </p>
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {pagePreview.chapters.map((ch) => (
                <label key={ch.no} className="flex min-h-[44px] items-center gap-3 rounded-xl border border-neutral-100 px-3 py-2">
                  <input type="checkbox" checked={!!chapterKeep[ch.no]} onChange={(e) => setChapterKeep({ ...chapterKeep, [ch.no]: e.target.checked })} className="h-5 w-5 shrink-0 accent-[#AC244D]" />
                  <span className="min-w-0 flex-1 truncate text-sm text-charcoal">{ch.no}. {ch.label}</span>
                </label>
              ))}
            </div>
            <button onClick={importFromPreview} disabled={importing || !comicId} className="btn-luxe min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50">
              {importing ? 'Importing…' : `Import ${pagePreview.chapters.filter((c) => chapterKeep[c.no]).length} episodes as drafts`}
            </button>
            {!comicId && <p className="text-xs text-neutral-500">Choose the comic these episodes go into above to switch this button on.</p>}
          </div>
        )}
        {pagePreview && pagePreview.kind === 'episode' && (
          <div className="mt-4 space-y-3">
            <p className="break-words text-sm font-semibold text-charcoal">{pagePreview.title}</p>
            {pagePreview.relay && (
              <p className="text-xs font-medium text-[#8a6d2a]">That site would not answer our server directly, so the page was read through a relay. The panels themselves still come from the source through our CDN.</p>
            )}
            <p className="text-xs text-neutral-500">
              {pagePreview.images.filter((i) => i.keep).length} panels found. Unticked pictures were judged to be site decoration; tick any of them if that call was wrong.
            </p>
            <div className="grid max-h-96 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
              {pagePreview.images.map((img) => (
                <label key={img.url} className={`relative block overflow-hidden rounded-xl ring-1 ${pageKeep[img.url] ? 'ring-primary' : 'opacity-60 ring-neutral-200'}`}>
                  <img src={img.url} alt="" loading="lazy" className="h-24 w-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-black/55 px-2 py-1.5">
                    <input type="checkbox" checked={!!pageKeep[img.url]} onChange={(e) => setPageKeep({ ...pageKeep, [img.url]: e.target.checked })} className="h-4 w-4 shrink-0 accent-[#AC244D]" />
                    <span className="truncate text-[10px] font-medium text-white">{img.keep ? 'Panel' : img.reason ?? 'Stray'}</span>
                  </span>
                </label>
              ))}
            </div>
            <button onClick={importFromPreview} disabled={importing || !comicId} className="btn-luxe min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50">
              {importing ? 'Importing…' : 'Import this episode as a draft'}
            </button>
            {!comicId && <p className="text-xs text-neutral-500">Choose the comic this episode goes into above to switch this button on.</p>}
          </div>
        )}
        {importLog.length > 0 && (
          <div className="mt-3 space-y-1 rounded-xl bg-cream px-3 py-2">
            {importLog.map((line, i) => (
              <p key={i} className="break-words text-xs text-neutral-600">{line}</p>
            ))}
          </div>
        )}
      </div>

      {/* Episode list */}
      <div className="mt-6 space-y-3">
        {!loading && draftCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-neutral-500">
              {draftCount} draft{draftCount === 1 ? '' : 's'} waiting to go live
            </p>
            <button
              onClick={publishAll}
              disabled={publishingAll}
              className="btn-luxe min-h-[44px] px-4 py-2 text-xs disabled:opacity-60"
            >
              <Send aria-hidden className="h-3 w-3" />
              {publishingAll
                ? 'Publishing…'
                : confirmPublishAll
                  ? `Tap again to publish ${draftCount}`
                  : `Publish all (${draftCount})`}
            </button>
          </div>
        )}
        {loading ? (
          <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>
        ) : episodes.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">No episodes yet. Create the first one above.</p>
        ) : episodes.map((e) => (
          <div key={e.id} className="card-luxe flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1 basis-48">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-charcoal">
                <span className="max-w-full truncate rounded-full bg-primary-muted px-2 py-0.5 text-[11px] font-bold text-primary">
                  {comicTitle(e.comic_id)} · Ep {e.episode_no}
                </span>
                <span className="min-w-0 truncate">{e.title}</span>
                {e.status === 'published'
                  ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600"><CheckCircle2 aria-hidden className="h-3 w-3" /> Published</span>
                  : <span className="text-[11px] font-medium text-neutral-400">Draft</span>}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                <span className="inline-flex items-center gap-1"><Eye aria-hidden className="h-3 w-3" /> {formatCompactCount(e.view_count)} reads</span>
                <span>{formatCompactCount(stats[e.id]?.readers ?? 0)} unique</span>
                <span>{formatCompactCount(stats[e.id]?.completed ?? 0)} finished</span>
              </p>
            </div>
            {e.status === 'draft' ? (
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => patch(e.id, 'publish')} className="btn-luxe min-h-[44px] px-4 py-2 text-xs">
                  <Send aria-hidden className="h-3 w-3" /> Publish
                </button>
                <button
                  onClick={() => remove(e.id)}
                  aria-label={confirmDelete === e.id ? 'Tap again to confirm delete' : 'Delete draft'}
                  className={`flex min-h-[44px] items-center justify-center rounded-full px-3 text-xs font-semibold ${
                    confirmDelete === e.id
                      ? 'bg-red-500 text-white'
                      : 'text-neutral-400 ring-1 ring-neutral-200 hover:bg-red-50 hover:text-red-500'
                  }`}
                >
                  {confirmDelete === e.id ? 'Tap again to delete' : <Trash2 aria-hidden className="h-4 w-4" />}
                </button>
              </div>
            ) : (
              <button onClick={() => patch(e.id, 'unpublish')} className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full px-4 py-2 text-xs font-semibold text-neutral-500 ring-1 ring-neutral-200 hover:bg-neutral-50">
                Unpublish
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
