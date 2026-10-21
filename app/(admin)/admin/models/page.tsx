'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Search, ShieldCheck, Eye, EyeOff } from '@/lib/icons'

interface ModelRow {
  id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  city: string | null
  is_verified: boolean
  rate_short_time_ngn: number | null
  show_on_map: boolean | null
}

/**
 * Admin > Companions. Real list with search, verification badge, map
 * visibility, and quick hide/show from the map.
 */
export default function AdminModelsPage() {
  const [models, setModels] = useState<ModelRow[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const supabase = createClient()

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url, is_verified, rate_short_time_ngn')
      .eq('role', 'model')
      .order('created_at', { ascending: false })
      .limit(200)
    const { data: presence } = await supabase
      .from('provider_presence')
      .select('provider_id, city, show_on_map')
    const byId: Record<string, { city: string | null; show_on_map: boolean | null }> = {}
    for (const p of presence ?? []) byId[(p as any).provider_id] = p as any
    setModels(((data ?? []) as any[]).map((m) => ({
      ...m,
      city: byId[m.id]?.city ?? null,
      show_on_map: byId[m.id]?.show_on_map ?? null,
    })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = models.filter((m) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (m.display_name ?? '').toLowerCase().includes(q)
      || (m.username ?? '').toLowerCase().includes(q)
      || (m.city ?? '').toLowerCase().includes(q)
  })

  async function toggleMap(m: ModelRow) {
    setActing(m.id)
    const { data: existing } = await supabase
      .from('provider_presence')
      .select('provider_id')
      .eq('provider_id', m.id)
      .maybeSingle()
    if (existing) {
      await supabase.from('provider_presence').update({ show_on_map: !m.show_on_map }).eq('provider_id', m.id)
    }
    await supabase.from('admin_audit_logs').insert({
      action: m.show_on_map ? 'model_hidden_from_map' : 'model_shown_on_map',
      target_id: m.id,
      details: `${m.show_on_map ? 'Hid' : 'Showed'} ${m.display_name ?? m.id} on map`,
    })
    setActing(null)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-charcoal">Companions</h1>
        <div className="relative">
          <Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, username, city..."
            className="pl-9"
          />
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-neutral-500">Loading companions…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-neutral-500">No companions yet. They appear here after signing up as a companion.</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {filtered.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                      {(m.display_name ?? '?')[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-charcoal">
                      {m.display_name ?? 'Unnamed'}
                      {m.is_verified && <ShieldCheck aria-hidden className="ml-1 inline h-4 w-4 text-primary" />}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {m.city ?? 'No city'}{m.rate_short_time_ngn ? ` · ₦${m.rate_short_time_ngn.toLocaleString()}` : ''}
                    </p>
                  </div>
                  <Link
                    href={m.username ? `/companion/${m.username}` : `/companion/${m.id}`}
                    className="inline-flex min-h-[44px] items-center px-1 text-xs font-medium text-primary hover:underline"
                  >
                    View
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acting === m.id}
                    onClick={() => toggleMap(m)}
                    title={m.show_on_map ? 'Hide from map' : 'Show on map'}
                    aria-label={m.show_on_map ? 'Hide from map' : 'Show on map'}
                  >
                    {m.show_on_map ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
