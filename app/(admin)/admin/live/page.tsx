'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Radio, Eye, Ban, Star, CheckCircle } from '@/lib/icons'
import { formatCompactCount } from '@/lib/utils/helpers'

interface Stream {
  id: string
  provider_id: string
  title: string
  price_ngn: number
  viewer_count: number
  status: string
  featured: boolean
  started_at: string
  scheduled_for: string | null
  ended_at: string | null
  provider_name: string | null
  provider_username: string | null
}

type LiveAction = 'end' | 'suspend' | 'restore' | 'feature' | 'unfeature'

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'ended', label: 'Ended' },
] as const

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Admin: live stream control. Feature, suspend, restore or end
 * any stream. All reads and writes go through /api/admin/live:
 * live_sessions RLS only lets a stream's own host update it, so
 * browser-side writes from here silently changed nothing. The
 * route checks the admin role server-side and writes with the
 * service client. Restoring clears the ended stamp so the room
 * can be rejoined cleanly.
 */
export default function AdminLivePage() {
  const [streams, setStreams] = useState<Stream[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [msg, setMsg] = useState('')
  const [acting, setActing] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/admin/live')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error('load failed')
      setStreams((data.streams ?? []) as Stream[])
    } catch {
      setMsg('Could not load the streams. Please try again.')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const act = async (id: string, action: LiveAction) => {
    setMsg('')
    setActing(id)
    try {
      const res = await fetch('/api/admin/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg(data.error ?? 'That change did not save. Please try again.')
        setActing(null)
        return
      }
    } catch {
      setMsg('That change did not save. Please try again.')
      setActing(null)
      return
    }
    setActing(null)
    load()
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const liveCount = streams.filter((s) => s.status === 'live').length
  const shown = filter ? streams.filter((s) => s.status === filter) : streams

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="t-page-title text-charcoal">Live streams</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Platform control: feature, suspend, or end any stream. {formatCompactCount(liveCount)} live now.
      </p>
      {msg && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</p>}

      <div className="scroll-row mt-4 gap-2 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
              filter === f.value ? 'bg-[#AC244D] text-white' : 'bg-white text-gray-600 ring-1 ring-neutral-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-12 text-center">
          <Radio aria-hidden className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="mt-3 text-neutral-500">No streams in this view yet.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {shown.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4">
              <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' + (s.status === 'live' ? 'bg-red-100 text-red-600' : 'bg-neutral-100 text-neutral-400')}>
                <Radio aria-hidden className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-sm font-semibold text-charcoal">
                  {s.title}
                  <span className="ml-2 font-normal text-neutral-400">
                    by{' '}
                    <Link
                      href={s.provider_username ? `/companion/${s.provider_username}` : `/companion/${s.provider_id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {s.provider_name}
                    </Link>
                  </span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                  <span className={'font-semibold ' + (s.status === 'live' ? 'text-red-600' : s.status === 'suspended' ? 'text-amber-600' : 'text-neutral-400')}>
                    {s.status.toUpperCase()}
                  </span>
                  <span className="flex items-center gap-1"><Eye aria-hidden className="h-3 w-3" />{formatCompactCount(s.viewer_count)}</span>
                  <span>{s.price_ngn > 0 ? '₦' + s.price_ngn.toLocaleString() + ' paid' : 'Free'}</span>
                  {s.status === 'scheduled' && s.scheduled_for ? (
                    <span>Starts {formatWhen(s.scheduled_for)}</span>
                  ) : s.status === 'ended' && s.ended_at ? (
                    <span>Ended {formatWhen(s.ended_at)}</span>
                  ) : (
                    <span>Started {formatWhen(s.started_at)}</span>
                  )}
                  {s.featured && <span className="font-semibold text-gold">FEATURED</span>}
                  {s.status === 'live' && (
                    <Link href={`/live/${s.id}`} className="font-semibold text-primary hover:underline">
                      Watch
                    </Link>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => act(s.id, s.featured ? 'unfeature' : 'feature')} disabled={acting === s.id} title={s.featured ? 'Unfeature' : 'Feature'} aria-label={s.featured ? 'Unfeature' : 'Feature'}
                  className={'flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-50 ' + (s.featured ? 'bg-gold/15 text-gold' : 'bg-neutral-100 text-neutral-400 hover:text-gold')}>
                  <Star className="h-4 w-4" />
                </button>
                {s.status === 'live' && (
                  <>
                    <button onClick={() => act(s.id, 'suspend')} disabled={acting === s.id} title="Suspend stream" aria-label="Suspend stream"
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50">
                      <Ban className="h-4 w-4" />
                    </button>
                    <button onClick={() => act(s.id, 'end')} disabled={acting === s.id} title="End stream" aria-label="End stream"
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50">
                      <CheckCircle className="h-4 w-4" />
                    </button>
                  </>
                )}
                {s.status === 'suspended' && (
                  <button onClick={() => act(s.id, 'restore')} disabled={acting === s.id} title="Restore stream" aria-label="Restore stream"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">
                    <CheckCircle className="h-4 w-4" />
                  </button>
                )}
                {s.status === 'scheduled' && (
                  <button onClick={() => act(s.id, 'end')} disabled={acting === s.id} title="Cancel scheduled stream" aria-label="Cancel scheduled stream"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50">
                    <Ban className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
