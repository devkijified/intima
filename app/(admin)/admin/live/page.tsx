'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
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
  provider_name: string | null
  provider_username: string | null
}

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'ended', label: 'Ended' },
] as const

/**
 * Admin: live stream control. Feature, suspend, restore or end
 * any stream; every write is checked and failures say so instead
 * of quietly reloading. Restoring clears the ended stamp so the
 * room can be rejoined cleanly.
 */
export default function AdminLivePage() {
  const [streams, setStreams] = useState<Stream[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [msg, setMsg] = useState('')
  const supabase = createClient()

  async function load() {
    const { data } = await supabase.from('live_sessions')
      .select('id, provider_id, title, price_ngn, viewer_count, status, featured, started_at')
      .order('started_at', { ascending: false }).limit(100)
    const list = (data ?? []) as any[]
    if (list.length > 0) {
      const { data: profs } = await supabase.from('profiles')
        .select('id, display_name, username').in('id', list.map((s) => s.provider_id))
      const byId = new Map((profs ?? []).map((p: any) => [p.id, p]))
      list.forEach((s) => {
        s.provider_name = byId.get(s.provider_id)?.display_name ?? 'Unknown'
        s.provider_username = byId.get(s.provider_id)?.username ?? null
      })
    }
    setStreams(list as Stream[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const setStatus = async (id: string, status: 'ended' | 'suspended' | 'live') => {
    setMsg('')
    const { error } = await supabase.from('live_sessions').update({
      status,
      ...(status === 'ended' ? { ended_at: new Date().toISOString() } : {}),
      ...(status === 'live' ? { ended_at: null } : {}),
    }).eq('id', id)
    if (error) {
      setMsg('That change did not save. Please try again.')
      return
    }
    load()
  }

  const toggleFeatured = async (id: string, featured: boolean) => {
    setMsg('')
    const { error } = await supabase.from('live_sessions').update({ featured: !featured }).eq('id', id)
    if (error) {
      setMsg('That change did not save. Please try again.')
      return
    }
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
        Platform control: feature, suspend, or end any stream. {liveCount} live now.
      </p>
      {msg && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</p>}

      <div className="scroll-row mt-4 gap-2 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full px-4 py-2 text-sm font-medium ${
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
                  {s.featured && <span className="font-semibold text-gold">FEATURED</span>}
                  {s.status === 'live' && (
                    <Link href={`/live/${s.id}`} className="font-semibold text-primary hover:underline">
                      Watch
                    </Link>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => toggleFeatured(s.id, s.featured)} title={s.featured ? 'Unfeature' : 'Feature'} aria-label={s.featured ? 'Unfeature' : 'Feature'}
                  className={'flex h-11 w-11 items-center justify-center rounded-full ' + (s.featured ? 'bg-gold/15 text-gold' : 'bg-neutral-100 text-neutral-400 hover:text-gold')}>
                  <Star className="h-4 w-4" />
                </button>
                {s.status === 'live' && (
                  <>
                    <button onClick={() => setStatus(s.id, 'suspended')} title="Suspend stream" aria-label="Suspend stream"
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200">
                      <Ban className="h-4 w-4" />
                    </button>
                    <button onClick={() => setStatus(s.id, 'ended')} title="End stream" aria-label="End stream"
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700 hover:bg-red-200">
                      <CheckCircle className="h-4 w-4" />
                    </button>
                  </>
                )}
                {s.status === 'suspended' && (
                  <button onClick={() => setStatus(s.id, 'live')} title="Restore stream" aria-label="Restore stream"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-green-100 text-green-700 hover:bg-green-200">
                    <CheckCircle className="h-4 w-4" />
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
