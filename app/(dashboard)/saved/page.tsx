'use client'

import { PullToRefresh } from '@/components/shared/PullToRefresh'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Heart, MapPin, Star, Trash2 } from '@/lib/icons'

interface SavedProvider {
  provider_id: string
  display_name: string | null
  avatar_url: string | null
  city: string | null
  rating: number | null
  username: string | null
}

export default function SavedPage() {
  const [saved, setSaved] = useState<SavedProvider[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    const { data: favs } = await supabase.from('favorites')
      .select('provider_id').eq('user_id', user.id).order('created_at', { ascending: false })
    const ids = (favs ?? []).map((f: any) => f.provider_id)
    if (ids.length === 0) { setSaved([]); setLoading(false); return }
    const { data: profs } = await supabase.from('profiles')
      .select('id, display_name, avatar_url, username').in('id', ids)
    const { data: pres } = await supabase.from('provider_presence')
      .select('provider_id, city').in('provider_id', ids)
    const cityById = new Map((pres ?? []).map((p: any) => [p.provider_id, p.city]))
    const { data: revs } = await supabase.from('reviews')
      .select('provider_id, rating').in('provider_id', ids)
    const byProv: Record<string, { sum: number; n: number }> = {}
    for (const r of (revs ?? []) as any[]) {
      const e = byProv[r.provider_id] ?? { sum: 0, n: 0 }
      e.sum += r.rating; e.n += 1
      byProv[r.provider_id] = e
    }
    setSaved((profs ?? []).map((p: any) => {
      const agg = byProv[p.id]
      return {
        provider_id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        city: cityById.get(p.id) ?? null,
        username: p.username ?? null,
        rating: agg ? Math.round((agg.sum / agg.n) * 10) / 10 : null,
      }
    }))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const remove = async (providerId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('favorites').delete().eq('user_id', user.id).eq('provider_id', providerId)
    setSaved((s) => s.filter((x) => x.provider_id !== providerId))
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={load} className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold text-charcoal">Saved companions</h1>
      {saved.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-neutral-200/80 bg-white p-12 text-center">
          <Heart className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="mt-3 font-medium text-charcoal">No saved companions yet</p>
          <p className="mt-1 text-sm text-neutral-500">Tap the heart on any profile to save her here.</p>
          <Link href="/" className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white">
            Browse companions
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {saved.map((p) => (
            <div key={p.provider_id} className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white">
              <Link href={p.username ? `/companion/${p.username}` : `/companion/${p.provider_id}`}>
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt={p.display_name ?? ''} className="aspect-[4/5] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[4/5] w-full items-center justify-center bg-cream">
                    <Heart className="h-8 w-8 text-neutral-300" />
                  </div>
                )}
              </Link>
              <div className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-charcoal">{p.display_name ?? 'Companion'}</p>
                  {p.city && <p className="flex items-center gap-1 text-xs text-neutral-500"><MapPin aria-hidden className="h-3 w-3" />{p.city}</p>}
                  {p.rating !== null && (
                    <p className="flex items-center gap-1 text-xs font-medium text-charcoal">
                      <Star aria-hidden className="h-3 w-3 text-gold" />{p.rating.toFixed(1)}
                    </p>
                  )}
                </div>
                <button onClick={() => remove(p.provider_id)} aria-label="Remove"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-red-50 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PullToRefresh>
  )
}
