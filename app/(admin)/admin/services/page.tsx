'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import {
  SERVICE_CATALOG,
  SERVICE_CATEGORIES,
  isCustomService,
  serviceLabel,
  type ServiceCategory,
} from '@/lib/services'
import { Tag } from '@/lib/icons'

/**
 * Admin > Services. The catalog is the source of truth in lib/services.ts
 * (service ids are stored on profiles.services as text[]). This page shows
 * the catalog with live usage counts: how many companions offer each.
 */
export default function AdminServicesPage() {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('profiles').select('services').eq('role', 'model')
      const c: Record<string, number> = {}
      for (const row of data ?? []) {
        for (const s of (row as any).services ?? []) {
          c[s] = (c[s] ?? 0) + 1
        }
      }
      setCounts(c)
      setLoading(false)
    })()
  }, [])

  const grouped: Record<ServiceCategory, typeof SERVICE_CATALOG> = {
    Calls: [], Dates: [], Experiences: [],
  }
  for (const s of SERVICE_CATALOG) grouped[s.category].push(s)

  // Custom services live in the same counts map under their full
  // "custom:<text>" storage value; labels resolve through lib/services.
  const customKeys = Object.keys(counts)
    .filter(isCustomService)
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-charcoal">Services</h1>
        <p className="text-sm text-neutral-500">
          The platform service catalog. Companions pick from this list on their profile and
          can add their own services in their own words. Changes to the catalog ship with a
          code update.
        </p>
      </div>
      {SERVICE_CATEGORIES.map((cat) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4 text-primary" /> {cat}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {grouped[cat].map((s) => (
                <div key={s.id} className="min-w-0 rounded-xl border border-neutral-200 px-4 py-3">
                  <p className="break-words text-sm font-medium text-charcoal">{s.label}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {loading ? '…' : `${counts[s.id] ?? 0} companion${(counts[s.id] ?? 0) === 1 ? '' : 's'}`}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      {customKeys.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4 text-[#C9A84C]" /> Custom services
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-neutral-500">
              Services companions added in their own words, beyond the catalog.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {customKeys.map((key) => (
                <div
                  key={key}
                  className="min-w-0 rounded-xl border border-[#C9A84C]/50 bg-[#C9A84C]/[0.06] px-4 py-3"
                >
                  <p className="break-words text-sm font-medium text-charcoal">{serviceLabel(key)}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {loading ? '…' : `${counts[key] ?? 0} companion${(counts[key] ?? 0) === 1 ? '' : 's'}`}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
