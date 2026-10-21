'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Plus, Send, Trash2, Eye, CheckCircle2, ArrowLeft } from '@/lib/icons'

interface Episode {
  id: string
  episode_no: number
  title: string
  status: 'draft' | 'published'
  published_at: string | null
  view_count: number
}

/** Admin: post episodes, publish (fans out push), track readers. */
export default function AdminComicsPage() {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [stats, setStats] = useState<Record<string, { readers: number; completed: number }>>({})
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [panels, setPanels] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [preview, setPreview] = useState<{ name: string; items: Array<{ guid: string; title: string; images: string[] }> } | null>(null)
  const [feeds, setFeeds] = useState<Array<{ id: string; name: string; url: string }>>([])

  async function load() {
    const res = await fetch('/api/admin/comics')
    const d = await res.json()
    if (res.ok) {
      setEpisodes(d.episodes ?? [])
      setStats(d.stats ?? {})
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

  async function create() {
    setBusy(true); setMsg('')
    const res = await fetch('/api/admin/comics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        synopsis: synopsis.trim(),
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

  async function remove(id: string) {
    if (!confirm('Delete this draft?')) return
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

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6">
      <Link href="/admin" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-neutral-500 hover:text-primary">
        <ArrowLeft aria-hidden className="h-4 w-4" /> Admin
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-muted">
          <BookOpen aria-hidden className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">Comics</h1>
          <p className="text-sm text-neutral-500">Episodes are house content: you post them, readers come back.</p>
        </div>
      </div>

      {/* Analytics strip */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { label: 'Total reads', value: totals.views },
          { label: 'Unique readers', value: totals.readers },
          { label: 'Completions', value: totals.completed },
        ].map((s) => (
          <div key={s.label} className="card-luxe p-4 text-center">
            <p className="font-display text-3xl font-semibold text-charcoal">{s.value.toLocaleString()}</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* New episode */}
      <div className="card-luxe mt-6 p-5">
        <h2 className="font-display text-xl font-semibold text-charcoal">New episode</h2>
        <div className="mt-4 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Episode title"
            className="min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base md:text-sm outline-none focus:border-primary" />
          <textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} placeholder="Synopsis (optional)"
            rows={2} className="min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base md:text-sm outline-none focus:border-primary" />
          <textarea value={panels} onChange={(e) => setPanels(e.target.value)} placeholder={'Panel image URLs, one per line, in reading order'}
            rows={5} className="min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 font-mono text-base md:text-sm outline-none focus:border-primary" />
          <button onClick={create} disabled={busy || !title.trim()} className="btn-luxe min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50">
            <Plus aria-hidden className="h-4 w-4" /> {busy ? 'Creating…' : 'Create draft'}
          </button>
          {msg && <p className="text-xs text-neutral-600">{msg}</p>}
        </div>
      </div>

      {/* Feed import */}
      <div className="card-luxe mt-6 p-5">
        <h2 className="font-display text-xl font-semibold text-charcoal">Import from a feed</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Paste an RSS feed URL from a comic you own or are licensed to republish.
          Add it as a feed and new episodes publish automatically each day, with credit to the source.
        </p>
        <div className="mt-3 flex gap-2">
          <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="https://example.com/feed.xml"
            className="min-h-[44px] min-w-0 flex-1 rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base md:text-sm outline-none focus:border-primary" />
          <button onClick={previewFeed} disabled={busy || !feedUrl.trim()} className="btn-soft min-h-[44px] px-4 py-2.5 text-sm disabled:opacity-50">Preview</button>
          <button onClick={addFeed} disabled={busy || !feedUrl.trim()} className="btn-luxe min-h-[44px] px-4 py-2.5 text-sm disabled:opacity-50">Add feed</button>
        </div>
        {feeds.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {feeds.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-xl bg-cream px-3 py-2 text-xs">
                <span className="min-w-0 truncate"><span className="font-semibold text-charcoal">{f.name}</span> · <span className="text-neutral-500">{f.url}</span></span>
                <button onClick={() => removeFeed(f.id)} className="ml-2 inline-flex min-h-[44px] shrink-0 items-center px-2 font-semibold text-red-500">Remove</button>
              </div>
            ))}
          </div>
        )}
        {preview && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-neutral-500">{preview.name}: {preview.items.length} items found</p>
            {preview.items.slice(0, 12).map((i) => (
              <div key={i.guid} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3 py-2">
                <span className="min-w-0 truncate text-sm text-charcoal">{i.title}</span>
                <span className="shrink-0 text-[11px] text-neutral-400">{i.images.length} panels</span>
                <button onClick={() => importItem(i.guid)} disabled={busy || i.images.length === 0} className="btn-luxe min-h-[44px] shrink-0 px-3 py-1.5 text-xs disabled:opacity-50">Import</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Episode list */}
      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>
        ) : episodes.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">No episodes yet. Create the first one above.</p>
        ) : episodes.map((e) => (
          <div key={e.id} className="card-luxe flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                <span className="rounded-full bg-primary-muted px-2 py-0.5 text-[11px] font-bold text-primary">Ep {e.episode_no}</span>
                <span className="truncate">{e.title}</span>
                {e.status === 'published'
                  ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600"><CheckCircle2 aria-hidden className="h-3 w-3" /> Published</span>
                  : <span className="text-[11px] font-medium text-neutral-400">Draft</span>}
              </p>
              <p className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
                <span className="inline-flex items-center gap-1"><Eye aria-hidden className="h-3 w-3" /> {e.view_count.toLocaleString()} reads</span>
                <span>{(stats[e.id]?.readers ?? 0).toLocaleString()} unique</span>
                <span>{(stats[e.id]?.completed ?? 0).toLocaleString()} finished</span>
              </p>
            </div>
            {e.status === 'draft' ? (
              <>
                <button onClick={() => patch(e.id, 'publish')} className="btn-luxe min-h-[44px] px-4 py-2 text-xs">
                  <Send aria-hidden className="h-3 w-3" /> Publish
                </button>
                <button onClick={() => remove(e.id)} aria-label="Delete draft" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-red-50 hover:text-red-500">
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button onClick={() => patch(e.id, 'unpublish')} className="inline-flex min-h-[44px] items-center justify-center rounded-full px-4 py-2 text-xs font-semibold text-neutral-500 ring-1 ring-neutral-200 hover:bg-neutral-50">
                Unpublish
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
