'use client'

import { useEffect, useState } from 'react'
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
}

export default function AdminLivePage() {
  const [streams, setStreams] = useState<Stream[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function load() {
    const { data } = await supabase.from('live_sessions')
      .select('id, provider_id, title, price_ngn, viewer_count, status, featured, started_at')
      .order('started_at', { ascending: false }).limit(50)
    const list = (data ?? []) as any[]
    if (list.length > 0) {
      const { data: profs } = await supabase.from('profiles')
        .select('id, display_name').in('id', list.map((s) => s.provider_id))
      const nameById = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]))
      list.forEach((s) => { s.provider_name = nameById.get(s.provider_id) ?? 'Unknown' })
    }
    setStreams(list as Stream[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const setStatus = async (id: string, status: 'ended' | 'suspended' | 'live') => {
    await supabase.from('live_sessions').update({
      status,
      ...(status === 'ended' ? { ended_at: new Date().toISOString() } : {}),
    }).eq('id', id)
    load()
  }

  const toggleFeatured = async (id: string, featured: boolean) => {
    await supabase.from('live_sessions').update({ featured: !featured }).eq('id', id)
    load()
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const live = streams.filter((s) => s.status === 'live')

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-semibold text-charcoal">Live streams</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Platform control: feature, suspend, or end any stream. {live.length} live now.
      </p>

      {streams.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-neutral-200 bg-white p-12 text-center">
          <Radio className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="mt-3 text-neutral-500">No streams yet.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {streams.map((s) => (
            <div key={s.id} className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4">
              <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' + (s.status === 'live' ? 'bg-red-100 text-red-600' : 'bg-neutral-100 text-neutral-400')}>
                <Radio className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-charcoal">
                  {s.title}
                  <span className="ml-2 font-normal text-neutral-400">by {s.provider_name}</span>
                </p>
                <p className="mt-0.5 flex items-center gap-3 text-xs text-neutral-500">
                  <span className={'font-semibold ' + (s.status === 'live' ? 'text-red-600' : s.status === 'suspended' ? 'text-amber-600' : 'text-neutral-400')}>
                    {s.status.toUpperCase()}
                  </span>
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{formatCompactCount(s.viewer_count)}</span>
                  <span>{s.price_ngn > 0 ? 'N' + s.price_ngn.toLocaleString() + ' paid' : 'Free'}</span>
                  {s.featured && <span className="font-semibold text-gold">FEATURED</span>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => toggleFeatured(s.id, s.featured)} title={s.featured ? 'Unfeature' : 'Feature'}
                  className={'rounded-full p-2 ' + (s.featured ? 'bg-gold/15 text-gold' : 'bg-neutral-100 text-neutral-400 hover:text-gold')}>
                  <Star className="h-4 w-4" />
                </button>
                {s.status === 'live' && (
                  <>
                    <button onClick={() => setStatus(s.id, 'suspended')} title="Suspend stream"
                      className="rounded-full bg-amber-100 p-2 text-amber-700 hover:bg-amber-200">
                      <Ban className="h-4 w-4" />
                    </button>
                    <button onClick={() => setStatus(s.id, 'ended')} title="End stream"
                      className="rounded-full bg-red-100 p-2 text-red-700 hover:bg-red-200">
                      <CheckCircle className="h-4 w-4" />
                    </button>
                  </>
                )}
                {s.status === 'suspended' && (
                  <button onClick={() => setStatus(s.id, 'live')} title="Restore stream"
                    className="rounded-full bg-green-100 p-2 text-green-700 hover:bg-green-200">
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
