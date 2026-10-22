'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Plus, Trash2 } from '@/lib/icons'

import { useCities } from '@/lib/citiesLive'

interface Tour {
  id: string
  city: string
  start_date: string
  end_date: string
}

/** Touring calendar: companions announce city visits; they appear on the map. */
export function TouringPanel() {
  const { cities: CITIES } = useCities()
  const [tours, setTours] = useState<Tour[]>([])
  const [city, setCity] = useState('Abuja')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('tour_dates')
      .select('id, city, start_date, end_date')
      .eq('provider_id', user.id)
      .gte('end_date', new Date().toISOString().slice(0, 10))
      .order('start_date', { ascending: true })
    setTours((data ?? []) as Tour[])
  }

  async function add() {
    if (!start || !end || busy) return
    setBusy(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); return }
    const { error } = await supabase.from('tour_dates').insert({
      provider_id: user.id, city, start_date: start, end_date: end,
    })
    setBusy(false)
    if (error) { setMsg('Could not add. Check the dates.'); return }
    setMsg('Tour added. Clients in ' + city + ' will see you.')
    setStart(''); setEnd('')
    load()
  }

  async function remove(id: string) {
    await supabase.from('tour_dates').delete().eq('id', id)
    setTours((t) => t.filter((x) => x.id !== id))
  }

  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })

  return (
    <div className="card-luxe p-5 sm:p-6">
      <h3 className="font-display text-lg font-semibold tracking-tight text-charcoal">Touring</h3>
      <p className="mt-1 text-xs text-neutral-500">
        Visiting another city? Announce it. You show on that city&apos;s map with a Touring tag for those dates.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select value={city} onChange={(e) => setCity(e.target.value)} className="min-h-[44px] rounded-xl border border-neutral-200 bg-cream/60 px-3 py-2 text-base md:text-sm">
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="min-h-[44px] rounded-xl border border-neutral-200 bg-cream/60 px-3 py-2 text-base md:text-sm" />
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="min-h-[44px] rounded-xl border border-neutral-200 bg-cream/60 px-3 py-2 text-base md:text-sm" />
        <button onClick={add} disabled={busy || !start || !end} className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-emerald-600">{msg}</p>}
      {tours.length > 0 && (
        <div className="mt-4 space-y-2">
          {tours.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-2xl bg-cream/60 px-4 py-2.5">
              <p className="flex items-center gap-1.5 text-sm text-charcoal">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="font-medium">{t.city}</span>
                <span className="text-neutral-500">{fmt(t.start_date)} – {fmt(t.end_date)}</span>
              </p>
              <button onClick={() => remove(t.id)} aria-label="Remove tour" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-red-50 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
