'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCities } from '@/lib/citiesLive'
import { Plane, ShieldCheck } from '@/lib/icons'

type TravelMode = 'none' | 'selected' | 'nationwide'

/**
 * Travel + client requirements, companion-facing.
 * Travel copy is written the way users talk: "I can travel".
 * Requirements copy the Bybit P2P counterparty-conditions pattern:
 * she decides who is allowed to open a booking with her.
 */
export function TravelRequirementsPanel() {
  const { cities: liveCities } = useCities()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [travelMode, setTravelMode] = useState<TravelMode>('none')
  const [travelCities, setTravelCities] = useState<string[]>([])
  const [reqVerified, setReqVerified] = useState(false)
  const [reqConnections, setReqConnections] = useState(0)
  const [reqDays, setReqDays] = useState(0)

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase.from('profiles')
        .select('travel_mode, travel_cities, req_verified_client, req_min_connections, req_min_account_days')
        .eq('id', user.id).maybeSingle()
      if (!live) return
      if (data) {
        setTravelMode((data.travel_mode as TravelMode) ?? 'none')
        setTravelCities(data.travel_cities ?? [])
        setReqVerified(data.req_verified_client ?? false)
        setReqConnections(data.req_min_connections ?? 0)
        setReqDays(data.req_min_account_days ?? 0)
      }
      setLoading(false)
    })()
    return () => { live = false }
  }, [])

  async function save() {
    setSaving(true); setMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { error } = await supabase.from('profiles').update({
      travel_mode: travelMode,
      travel_cities: travelMode === 'selected' ? travelCities : [],
      req_verified_client: reqVerified,
      req_min_connections: reqConnections,
      req_min_account_days: reqDays,
    }).eq('id', user.id)
    setSaving(false)
    setMsg(error ? 'Could not save. Please try again.' : 'Saved. Clients now see this on your page.')
  }

  if (loading) return null

  return (
    <div className="card-luxe mt-6 p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-muted">
          <Plane className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h3 className="font-display text-xl font-semibold tracking-tight text-charcoal">Travel</h3>
          <p className="text-[13px] text-neutral-500">Can clients in other cities book you to come over?</p>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {([
          ['none', "I can't travel", 'Clients only meet me in my base city.'],
          ['selected', 'I can travel to some cities', 'Pick the cities below.'],
          ['nationwide', 'I can travel anywhere in Nigeria', 'Any client in Nigeria can book you.'],
        ] as const).map(([mode, title, sub]) => (
          <button key={mode} onClick={() => setTravelMode(mode)}
            className={`flex w-full items-start gap-3 rounded-2xl p-3.5 text-left ring-1 transition-all active:scale-[0.99] ${travelMode === mode ? 'bg-primary-muted ring-primary/40' : 'bg-white ring-black/[0.06]'}`}>
            <span>
              <span className="block text-sm font-semibold text-charcoal">{title}</span>
              <span className="block text-[13px] text-neutral-500">{sub}</span>
            </span>
          </button>
        ))}
      </div>

      {travelMode === 'selected' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {liveCities.map((c) => {
            const on = travelCities.includes(c)
            return (
              <button key={c} onClick={() => setTravelCities(on ? travelCities.filter((x) => x !== c) : [...travelCities, c])}
                className={`inline-flex min-h-[44px] items-center rounded-full px-3.5 py-2 text-[13px] font-medium transition-all active:scale-95 ${on ? 'bg-primary text-white' : 'bg-cream text-neutral-600 ring-1 ring-black/[0.06]'}`}>
                {c}
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-muted">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h3 className="font-display text-xl font-semibold tracking-tight text-charcoal">Who can book you</h3>
          <p className="text-[13px] text-neutral-500">Clients who do not qualify see what they are missing. They cannot pay until they qualify.</p>
        </div>
      </div>

      <div className="mt-4 space-y-5">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-charcoal">Verified clients only</span>
          <input type="checkbox" checked={reqVerified} onChange={(e) => setReqVerified(e.target.checked)} className="h-5 w-5 accent-[#AC244D]" />
        </label>
        <div>
          <p className="text-sm font-medium text-charcoal">Minimum completed bookings</p>
          <div className="mt-2 flex gap-2">
            {[0, 1, 3, 5, 10].map((n) => (
              <button key={n} onClick={() => setReqConnections(n)}
                className={`inline-flex min-h-[44px] items-center rounded-full px-3.5 py-2 text-[13px] font-medium ${reqConnections === n ? 'bg-primary text-white' : 'bg-cream text-neutral-600 ring-1 ring-black/[0.06]'}`}>
                {n === 0 ? 'Any' : `${n}+`}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-charcoal">Minimum account age</p>
          <div className="mt-2 flex gap-2">
            {[0, 7, 30, 90].map((n) => (
              <button key={n} onClick={() => setReqDays(n)}
                className={`inline-flex min-h-[44px] items-center rounded-full px-3.5 py-2 text-[13px] font-medium ${reqDays === n ? 'bg-primary text-white' : 'bg-cream text-neutral-600 ring-1 ring-black/[0.06]'}`}>
                {n === 0 ? 'Any' : `${n} days`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving} className="btn-luxe mt-5 inline-flex min-h-[44px] w-full items-center justify-center py-3 text-sm disabled:opacity-50">
        {saving ? 'Saving…' : 'Save travel and requirements'}
      </button>
      {msg && <p className="mt-2 text-center text-xs text-neutral-500">{msg}</p>}
    </div>
  )
}
