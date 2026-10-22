'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Search, Eye, EyeOff } from '@/lib/icons'
import { VerifiedBadge } from '@/components/admin/VerifiedBadge'
import { DetailSheet } from '@/components/admin/DetailSheet'

interface ModelRow {
  id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  city: string | null
  is_verified: boolean
  rate_short_time_ngn: number | null
  show_on_map: boolean | null
  is_hidden: boolean
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
  const [msg, setMsg] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const supabase = createClient()

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url, is_verified, is_hidden, rate_short_time_ngn')
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

  // Hidden means: profile flag down AND presence off the map. The
  // flag lives on profiles (is_hidden), so it works even when a
  // companion has no presence row yet; presence is still flipped
  // when a row exists so both records agree.
  const isHidden = (m: ModelRow) => m.is_hidden === true || m.show_on_map === false

  // The detail panel reads the live row, so a hide or show done
  // from inside it shows the new state without reopening.
  const selected = selectedId ? models.find((m) => m.id === selectedId) ?? null : null

  async function toggleMap(m: ModelRow) {
    setActing(m.id)
    setMsg('')
    const hiding = !isHidden(m)
    const { error: pErr } = await supabase
      .from('profiles')
      .update({ is_hidden: hiding })
      .eq('id', m.id)
    if (pErr) {
      setMsg('That change did not save. Please try again.')
      setActing(null)
      return
    }
    const { data: existing } = await supabase
      .from('provider_presence')
      .select('provider_id')
      .eq('provider_id', m.id)
      .maybeSingle()
    if (existing) {
      const { error: presErr } = await supabase
        .from('provider_presence')
        .update({ show_on_map: !hiding })
        .eq('provider_id', m.id)
      if (presErr) {
        setMsg('Her profile flag changed but the map pin did not follow. Reload and try the toggle again.')
        setActing(null)
        load()
        return
      }
    }
    await supabase.from('admin_audit_logs').insert({
      action: hiding ? 'model_hidden_from_map' : 'model_shown_on_map',
      target_id: m.id,
      details: `${hiding ? 'Hid' : 'Showed'} ${m.display_name ?? m.id} on map`,
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
      {msg && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</p>}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-neutral-500">Loading companions…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-neutral-500">No companions yet. They appear here after signing up as a companion.</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {filtered.map((m) => (
                <div
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedId(m.id)
                    }
                  }}
                  aria-label={`Open details for ${m.display_name ?? 'this companion'}`}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-cream/70 focus:outline-none focus-visible:bg-cream"
                >
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                      {(m.display_name ?? '?')[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-charcoal">
                      <span className="min-w-0 truncate">{m.display_name ?? 'Unnamed'}</span>
                      {m.is_verified && <VerifiedBadge />}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {m.city ?? 'No city'}{m.rate_short_time_ngn ? ` · ₦${m.rate_short_time_ngn.toLocaleString()}` : ''}
                      {isHidden(m) && <span className="ml-2 font-semibold text-amber-600">HIDDEN FROM MAP</span>}
                      {m.show_on_map === null && !m.is_hidden && <span className="ml-2 text-neutral-400">No presence yet</span>}
                    </p>
                  </div>
                  <Link
                    href={m.username ? `/companion/${m.username}` : `/companion/${m.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex min-h-[44px] items-center px-1 text-xs font-medium text-primary hover:underline"
                  >
                    View
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acting === m.id}
                    onClick={(e) => { e.stopPropagation(); toggleMap(m) }}
                    title={isHidden(m) ? 'Show on map' : 'Hide from map'}
                    aria-label={isHidden(m) ? 'Show on map' : 'Hide from map'}
                  >
                    {isHidden(m) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <DetailSheet
        open={selected !== null}
        title="Companion details"
        onClose={() => setSelectedId(null)}
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              {selected.avatar_url ? (
                <img src={selected.avatar_url} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                  {(selected.display_name ?? '?')[0]}
                </div>
              )}
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-display text-lg font-semibold text-charcoal">
                  <span className="min-w-0 truncate">{selected.display_name ?? 'Unnamed'}</span>
                  {selected.is_verified && <VerifiedBadge />}
                </p>
                <p className="truncate text-sm text-neutral-500">
                  {selected.username ? `@${selected.username}` : 'No username yet'}
                </p>
              </div>
            </div>

            <dl className="divide-y divide-neutral-100 rounded-2xl bg-cream/60 px-4 ring-1 ring-black/[0.04]">
              {[
                ['City', selected.city ?? 'No city set'],
                ['Short time rate', selected.rate_short_time_ngn
                  ? `₦${selected.rate_short_time_ngn.toLocaleString()}`
                  : 'Not set'],
                ['On the map', isHidden(selected)
                  ? 'Hidden from the map'
                  : selected.show_on_map === null
                    ? 'No presence yet'
                    : 'Showing on the map'],
                ['Verification', selected.is_verified ? 'Verified' : 'Not verified'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <dt className="text-neutral-500">{label}</dt>
                  <dd className="text-right font-medium text-charcoal">{value}</dd>
                </div>
              ))}
              <div className="py-3 text-sm">
                <dt className="text-neutral-500">Companion ID</dt>
                <dd className="mt-1 break-all font-mono text-[11px] text-neutral-500">{selected.id}</dd>
              </div>
            </dl>

            <div className="space-y-2">
              <Link
                href={selected.username ? `/companion/${selected.username}` : `/companion/${selected.id}`}
                className="flex min-h-[44px] w-full items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#8F1D40]"
              >
                View public profile
              </Link>
              <Button
                variant="outline"
                disabled={acting === selected.id}
                onClick={() => toggleMap(selected)}
                className="min-h-[44px] w-full"
              >
                {isHidden(selected) ? (
                  <><Eye aria-hidden className="h-4 w-4" /> Show on the map</>
                ) : (
                  <><EyeOff aria-hidden className="h-4 w-4" /> Hide from the map</>
                )}
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-neutral-400">
              Hiding takes her pin off the map and her profile out of public listings. Her account and verification stay untouched.
            </p>
          </div>
        )}
      </DetailSheet>
    </div>
  )
}
