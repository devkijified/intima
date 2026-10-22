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
import { NIGERIA_CITIES } from '@/lib/cities'
import { DEFAULT_VIBES } from '@/lib/vibes'
import { getSetting } from '@/lib/settings/platformSettings'
import { MapPin, Plus, Sparkles, Tag, Trash2 } from '@/lib/icons'
import { HelpTip } from '@/components/ui/Tooltip'

const inputCls =
  'min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base outline-none focus:border-primary md:text-sm'

/**
 * Admin > Services, vibes and cities. The built-in catalog below
 * ships with the app; the preset lists and the city list are
 * editable here and take effect everywhere immediately, no code
 * update: companions pick up new services and vibes in setup and
 * on their profile, and new cities appear in every picker and on
 * the map.
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

  const customKeys = Object.keys(counts)
    .filter(isCustomService)
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-page-title text-charcoal">Services, vibes and cities</h1>
        <p className="text-sm text-neutral-500">
          The built-in service catalog ships with the app. Preset services, vibe tags and
          the city list are yours to edit: changes apply everywhere at once.
        </p>
      </div>

      <PresetEditor
        settingKey="preset_services"
        title="Preset services"
        icon={<Tag className="h-4 w-4 text-primary" />}
        blurb="Extra services companions can pick with one tap instead of typing their own. They appear in setup and on the profile editor, under More options."
        placeholder="e.g. Dinner and a show"
        defaults={[]}
      />

      <PresetEditor
        settingKey="preset_vibes"
        title="Vibe tags"
        icon={<Sparkles className="h-4 w-4 text-primary" />}
        blurb="The vibe tags companions pick for their profile, like 420 Friendly. They show as chips on her profile and in her map card."
        placeholder="e.g. 420 Friendly"
        defaults={DEFAULT_VIBES}
      />

      <CitiesEditor />

      {SERVICE_CATEGORIES.map((cat) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4 text-primary" /> Built-in services: {cat}
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
              <Tag className="h-4 w-4 text-[#C9A84C]" /> Custom services in use
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-neutral-500">
              Services companions added in their own words, beyond the catalog and presets.
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

async function saveSetting(key: string, value: unknown): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('platform_settings')
    .update({ value: value as never, updated_at: new Date().toISOString() })
    .eq('key', key)
  return !error
}

/** One editable string list backed by a platform_settings row. */
function PresetEditor({
  settingKey,
  title,
  icon,
  blurb,
  placeholder,
  defaults,
}: {
  settingKey: string
  title: string
  icon: React.ReactNode
  blurb: string
  placeholder: string
  defaults: string[]
}) {
  const [items, setItems] = useState<string[]>(defaults)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const supabase = createClient()

  useEffect(() => {
    ;(async () => {
      const saved = await getSetting<unknown>(settingKey, null)
      if (Array.isArray(saved)) {
        setItems(saved.filter((x): x is string => typeof x === 'string'))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingKey])

  async function persist(next: string[]) {
    setBusy(true)
    const ok = await saveSetting(settingKey, next)
    setBusy(false)
    if (ok) {
      setItems(next)
      setNote('Saved. The change is live everywhere now.')
    } else {
      setNote('Could not save. Please try again.')
    }
  }

  function add() {
    const v = draft.trim()
    if (!v) return
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) {
      setNote('That one is already on the list.')
      return
    }
    setDraft('')
    void persist([...items, v])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
          <HelpTip text={blurb} label={`About ${title.toLowerCase()}`} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-neutral-500">{blurb}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {items.length === 0 ? (
            <p className="text-sm text-neutral-400">None yet. Add the first one below.</p>
          ) : items.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 rounded-full bg-cream py-1 pl-3 pr-1 text-[13px] font-medium text-charcoal ring-1 ring-black/[0.05]">
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                disabled={busy}
                onClick={() => void persist(items.filter((i) => i !== item))}
                className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder={placeholder}
            className={`${inputCls} min-w-0 flex-1`}
          />
          <button type="button" onClick={add} disabled={busy || !draft.trim()} className="btn-luxe min-h-[44px] shrink-0 px-4 py-2.5 text-sm disabled:opacity-50">
            <Plus aria-hidden className="h-4 w-4" /> Add
          </button>
        </div>
        {note && <p className="mt-2 text-xs text-neutral-500">{note}</p>}
      </CardContent>
    </Card>
  )
}

/** The city list + optional map centres for cities added later. */
function CitiesEditor() {
  const [cities, setCities] = useState<string[]>([...NIGERIA_CITIES])
  const [coords, setCoords] = useState<Record<string, [number, number]>>({})
  const [name, setName] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    ;(async () => {
      const [savedCities, savedCoords] = await Promise.all([
        getSetting<unknown>('cities', null),
        getSetting<unknown>('city_coords', null),
      ])
      if (Array.isArray(savedCities)) {
        const list = savedCities.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        if (list.length > 0) setCities(list)
      }
      if (savedCoords && typeof savedCoords === 'object' && !Array.isArray(savedCoords)) {
        setCoords(savedCoords as Record<string, [number, number]>)
      }
    })()
  }, [])

  async function persist(nextCities: string[], nextCoords: Record<string, [number, number]>) {
    setBusy(true)
    const okCities = await saveSetting('cities', nextCities)
    const okCoords = await saveSetting('city_coords', nextCoords)
    setBusy(false)
    if (okCities && okCoords) {
      setCities(nextCities)
      setCoords(nextCoords)
      setNote('Saved. Pickers and the map use the new list right away.')
    } else {
      setNote('Could not save. Please try again.')
    }
  }

  function add() {
    const v = name.trim()
    if (!v) return
    if (cities.some((c) => c.toLowerCase() === v.toLowerCase())) {
      setNote('That city is already on the list.')
      return
    }
    const nextCoords = { ...coords }
    const la = Number(lat)
    const ln = Number(lng)
    if (lat.trim() && lng.trim() && Number.isFinite(la) && Number.isFinite(ln)) {
      nextCoords[v] = [la, ln]
    }
    setName(''); setLat(''); setLng('')
    void persist([...cities, v], nextCoords)
  }

  function remove(city: string) {
    const nextCoords = { ...coords }
    delete nextCoords[city]
    void persist(cities.filter((c) => c !== city), nextCoords)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" /> Cities
          <HelpTip text="Cities are not fixed in code. Add one here and companions can base there, clients can post board requests there, and the map can fly to it. Latitude and longitude are the city centre, used only for area-level pins." label="About cities" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-neutral-500">
          The cities companions can base themselves in. Add latitude and longitude for a new
          city so the map can fly to it and pins can be placed there.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {cities.map((city) => (
            <span key={city} className="inline-flex items-center gap-1 rounded-full bg-cream py-1 pl-3 pr-1 text-[13px] font-medium text-charcoal ring-1 ring-black/[0.05]">
              {city}
              <button
                type="button"
                aria-label={`Remove ${city}`}
                disabled={busy}
                onClick={() => remove(city)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_110px_110px_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="City name, e.g. Asaba" className={inputCls} />
          <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Lat" inputMode="decimal" className={inputCls} />
          <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Lng" inputMode="decimal" className={inputCls} />
          <button type="button" onClick={add} disabled={busy || !name.trim()} className="btn-luxe min-h-[44px] px-4 py-2.5 text-sm disabled:opacity-50">
            <Plus aria-hidden className="h-4 w-4" /> Add city
          </button>
        </div>
        {note && <p className="mt-2 text-xs text-neutral-500">{note}</p>}
      </CardContent>
    </Card>
  )
}
