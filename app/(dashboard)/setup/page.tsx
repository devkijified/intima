'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SERVICE_CATALOG } from '@/lib/services'
import { NIGERIA_CITIES, cityCoords } from '@/lib/cities'
import { computeSetupSteps, isLiveOnMap, type SetupProfile } from '@/lib/setup/completeness'
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck'
import { AvatarUploader, GalleryUploader } from '@/components/uploads/PhotoUploader'
import {
  ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, Clock, MapPin, Plane, ShieldCheck,
} from '@/lib/icons'

const STEP_TITLES = [
  'Welcome',
  'Name and base city',
  'Your photos',
  'Rates and services',
  'Can you travel?',
  'Who can book you',
  'Get verified',
  'You are set',
]

/**
 * Companion setup wizard: one decision per screen, saves as she goes,
 * and ends with the honest map-gate checklist. Every field written here
 * is the same field the profile editor writes.
 */
export default function SetupWizardPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [displayName, setDisplayName] = useState('')
  const [city, setCity] = useState('Lagos')
  const [presenceCity, setPresenceCity] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [galleryUrls, setGalleryUrls] = useState<string[]>([])
  const [rateShort, setRateShort] = useState('')
  const [rateOvernight, setRateOvernight] = useState('')
  const [rateWeekend, setRateWeekend] = useState('')
  const [negotiable, setNegotiable] = useState(true)
  const [services, setServices] = useState<string[]>([])
  const [travelMode, setTravelMode] = useState<'none' | 'selected' | 'nationwide'>('none')
  const [travelCities, setTravelCities] = useState<string[]>([])
  const [reqVerified, setReqVerified] = useState(false)
  const [reqConnections, setReqConnections] = useState(0)
  const [reqDays, setReqDays] = useState(0)
  const [profileSnap, setProfileSnap] = useState<SetupProfile | null>(null)
  const [vStatus, setVStatus] = useState('unverified')

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      if (!live) return
      setUserId(user.id)
      const [{ data: p }, { data: presence }] = await Promise.all([
        supabase.from('profiles')
          .select('display_name, avatar_url, gallery_urls, rate_short_time_ngn, rate_overnight_ngn, rate_weekend_ngn, services, rates_negotiable, travel_mode, travel_cities, req_verified_client, req_min_connections, req_min_account_days, verification_status, username')
          .eq('id', user.id).maybeSingle(),
        supabase.from('provider_presence')
          .select('city').eq('provider_id', user.id).maybeSingle(),
      ])
      if (!live || !p) { setLoading(false); return }
      setDisplayName(p.display_name ?? '')
      setAvatarUrl(p.avatar_url ?? '')
      setGalleryUrls(p.gallery_urls ?? [])
      setRateShort(p.rate_short_time_ngn?.toString() ?? '')
      setRateOvernight(p.rate_overnight_ngn?.toString() ?? '')
      setRateWeekend(p.rate_weekend_ngn?.toString() ?? '')
      setNegotiable(p.rates_negotiable ?? true)
      setServices(p.services ?? [])
      setTravelMode((p.travel_mode as typeof travelMode) ?? 'none')
      setTravelCities(p.travel_cities ?? [])
      setReqVerified(p.req_verified_client ?? false)
      setReqConnections(p.req_min_connections ?? 0)
      setReqDays(p.req_min_account_days ?? 0)
      setVStatus(p.verification_status ?? 'unverified')
      setUsername(p.username ?? null)
      setProfileSnap(p as SetupProfile)
      if (presence?.city) { setCity(presence.city); setPresenceCity(presence.city) }
      setLoading(false)
    })()
    return () => { live = false }
  }, [])

  const steps = useMemo(
    () => computeSetupSteps(
      {
        display_name: displayName || null,
        avatar_url: avatarUrl || null,
        rate_short_time_ngn: rateShort ? Number(rateShort) : null,
        rate_overnight_ngn: rateOvernight ? Number(rateOvernight) : null,
        rate_weekend_ngn: rateWeekend ? Number(rateWeekend) : null,
        services,
        verification_status: vStatus,
      },
      presenceCity
    ),
    [displayName, avatarUrl, rateShort, rateOvernight, rateWeekend, services, vStatus, presenceCity]
  )
  const live_ = isLiveOnMap(steps)

  const num = (s: string) => {
    const n = parseInt(s.replace(/[^0-9]/g, ''), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  async function saveStep(): Promise<boolean> {
    if (!userId) return false
    setError('')
    setSaving(true)
    try {
      if (step === 1) {
        const scan = scanForLeaks(displayName)
        if (!scan.clean) { setError(leakWarning(scan.leaks)); return false }
        if (!displayName.trim()) { setError('Your display name is what clients see. It cannot be empty.'); return false }
        const { error: e1 } = await supabase.from('profiles')
          .update({ display_name: displayName.trim() }).eq('id', userId)
        if (e1) throw e1
        const [lat, lng] = cityCoords(city)
        const { error: e2 } = await supabase.from('provider_presence').upsert(
          { provider_id: userId, city, area_lat: lat, area_lng: lng, show_on_map: true, is_available: true, updated_at: new Date().toISOString() },
          { onConflict: 'provider_id' }
        )
        if (e2) throw e2
        setPresenceCity(city)
      }
      if (step === 2) {
        if (!avatarUrl.trim()) {
          setError('Add your main profile photo first: the map only lists companions with a photo, so this step cannot be skipped. You can change the photo any time.')
          return false
        }
        const { error: e } = await supabase.from('profiles')
          .update({ avatar_url: avatarUrl.trim() || null, gallery_urls: galleryUrls }).eq('id', userId)
        if (e) throw e
      }
      if (step === 3) {
        const { error: e } = await supabase.from('profiles')
          .update({
            rate_short_time_ngn: num(rateShort),
            rate_overnight_ngn: num(rateOvernight),
            rate_weekend_ngn: num(rateWeekend),
            services,
            rates_negotiable: negotiable,
          }).eq('id', userId)
        if (e) throw e
      }
      if (step === 4) {
        const { error: e } = await supabase.from('profiles')
          .update({ travel_mode: travelMode, travel_cities: travelMode === 'selected' ? travelCities : [] }).eq('id', userId)
        if (e) throw e
      }
      if (step === 5) {
        const { error: e } = await supabase.from('profiles')
          .update({ req_verified_client: reqVerified, req_min_connections: reqConnections, req_min_account_days: reqDays }).eq('id', userId)
        if (e) throw e
      }
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function next() {
    if (step >= 1 && step <= 5) {
      const ok = await saveStep()
      if (!ok) return
    }
    setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1))
  }

  if (loading) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-48 pt-6 animate-rise-in md:pb-28">
      {/* Progress */}
      <div className="flex items-center gap-1.5">
        {STEP_TITLES.map((t, i) => (
          <span key={t} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-neutral-200'}`} />
        ))}
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-400">
        Step {step + 1} of {STEP_TITLES.length}: {STEP_TITLES[step]}
      </p>

      {step === 0 && (
        <div className="mt-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">Let us set up your account</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
            A few short steps and clients can find you, book you, and pay through Intima. You can change everything later in your profile.
          </p>
          <div className="card-luxe mt-6 space-y-3 p-5">
            {steps.map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                {s.done
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  : <span className="h-5 w-5 rounded-full ring-2 ring-neutral-200" />}
                <span className="text-sm font-medium text-charcoal">{s.label}</span>
                {!s.required && <span className="text-[11px] text-neutral-400">optional</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="mt-4 space-y-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">Your name and base city</h1>
          <div className="card-luxe space-y-4 p-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Display name</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="The name clients will see"
                className="mt-1.5 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-[15px] outline-none focus:border-primary" />
              <p className="mt-1.5 text-xs text-neutral-400">No phone numbers or social handles. Clients reach you through Intima.</p>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Base city</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {NIGERIA_CITIES.map((c) => (
                  <button key={c} onClick={() => setCity(c)}
                    className={`rounded-full px-3.5 py-2 text-[13px] font-medium transition-all active:scale-95 ${city === c ? 'bg-primary text-white shadow-cta' : 'bg-cream text-neutral-600 ring-1 ring-black/[0.06]'}`}>
                    {c}
                  </button>
                ))}
              </div>
              <p className="mt-2 flex items-center gap-1 text-xs text-neutral-400"><MapPin className="h-3 w-3" /> Your pin shows your area, never your exact address.</p>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-4 space-y-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">Your photos</h1>
          <p className="text-sm text-neutral-500">Your profile photo is required for the map. Add photos straight from your phone.</p>
          <div className="card-luxe space-y-4 p-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Main photo</label>
              <div className="mt-1.5">
                <AvatarUploader userId={userId} value={avatarUrl} onChange={setAvatarUrl} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">More photos</label>
              <div className="mt-1.5">
                <GalleryUploader userId={userId} value={galleryUrls} onChange={setGalleryUrls} />
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-4 space-y-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">Rates and services</h1>
          <div className="card-luxe space-y-4 p-5">
            {([
              ['Short time (₦)', rateShort, setRateShort],
              ['Overnight (₦)', rateOvernight, setRateOvernight],
              ['Weekend (₦)', rateWeekend, setRateWeekend],
            ] as const).map(([label, val, set]) => (
              <div key={label}>
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">{label}</label>
                <input value={val} onChange={(e) => set(e.target.value)} inputMode="numeric" placeholder="e.g. 150000"
                  className="mt-1.5 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-[15px] outline-none focus:border-primary" />
              </div>
            ))}
            <label className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
              <span className="text-sm font-medium text-charcoal">My rates are negotiable</span>
              <input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} className="h-5 w-5 accent-[#AC244D]" />
            </label>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Services you offer</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {SERVICE_CATALOG.map((s) => {
                  const on = services.includes(s.id)
                  return (
                    <button key={s.id} onClick={() => setServices(on ? services.filter((x) => x !== s.id) : [...services, s.id])}
                      className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-all active:scale-95 ${on ? 'bg-primary text-white' : 'bg-cream text-neutral-600 ring-1 ring-black/[0.06]'}`}>
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="mt-4 space-y-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">Can you travel?</h1>
          <p className="text-sm text-neutral-500">Some companions only work in their city. Others can travel to clients. Tell clients which one you are.</p>
          <div className="space-y-2.5">
            {([
              ['none', "I can't travel", 'Clients only meet me in my base city.'],
              ['selected', 'I can travel to some cities', 'Pick the cities you can travel to.'],
              ['nationwide', 'I can travel anywhere in Nigeria', 'Any client in Nigeria can book you to come over.'],
            ] as const).map(([mode, title, sub]) => (
              <button key={mode} onClick={() => setTravelMode(mode)}
                className={`card-luxe flex w-full items-start gap-3 p-4 text-left transition-all active:scale-[0.99] ${travelMode === mode ? 'ring-2 ring-primary' : ''}`}>
                <Plane className={`mt-0.5 h-5 w-5 shrink-0 ${travelMode === mode ? 'text-primary' : 'text-neutral-300'}`} />
                <span>
                  <span className="block font-semibold text-charcoal">{title}</span>
                  <span className="block text-[13px] text-neutral-500">{sub}</span>
                </span>
              </button>
            ))}
          </div>
          {travelMode === 'selected' && (
            <div className="card-luxe p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Cities you can travel to</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {NIGERIA_CITIES.filter((c) => c !== city).map((c) => {
                  const on = travelCities.includes(c)
                  return (
                    <button key={c} onClick={() => setTravelCities(on ? travelCities.filter((x) => x !== c) : [...travelCities, c])}
                      className={`rounded-full px-3.5 py-2 text-[13px] font-medium transition-all active:scale-95 ${on ? 'bg-primary text-white' : 'bg-cream text-neutral-600 ring-1 ring-black/[0.06]'}`}>
                      {c}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="mt-4 space-y-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">Who can book you</h1>
          <p className="text-sm text-neutral-500">Like Bybit P2P, you can set who is allowed to open a booking with you. Clients who do not qualify will see what they are missing instead of paying.</p>
          <div className="card-luxe space-y-5 p-5">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold text-charcoal">Verified clients only</span>
                <span className="block text-[13px] text-neutral-500">The client must have passed ID verification.</span>
              </span>
              <input type="checkbox" checked={reqVerified} onChange={(e) => setReqVerified(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#AC244D]" />
            </label>
            <div>
              <p className="text-sm font-semibold text-charcoal">Minimum completed bookings</p>
              <p className="text-[13px] text-neutral-500">The client must have completed at least this many bookings on Intima.</p>
              <div className="mt-2 flex gap-2">
                {[0, 1, 3, 5, 10].map((n) => (
                  <button key={n} onClick={() => setReqConnections(n)}
                    className={`rounded-full px-3.5 py-2 text-[13px] font-medium ${reqConnections === n ? 'bg-primary text-white' : 'bg-cream text-neutral-600 ring-1 ring-black/[0.06]'}`}>
                    {n === 0 ? 'Any' : `${n}+`}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-charcoal">Minimum account age</p>
              <p className="text-[13px] text-neutral-500">Brand new accounts are where most problems come from.</p>
              <div className="mt-2 flex gap-2">
                {[0, 7, 30, 90].map((n) => (
                  <button key={n} onClick={() => setReqDays(n)}
                    className={`rounded-full px-3.5 py-2 text-[13px] font-medium ${reqDays === n ? 'bg-primary text-white' : 'bg-cream text-neutral-600 ring-1 ring-black/[0.06]'}`}>
                    {n === 0 ? 'Any' : `${n} days`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="mt-4 space-y-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">Get verified</h1>
          <p className="text-sm leading-relaxed text-neutral-500">
            Verified companions get the badge, rank higher, and earn client trust. It takes three photos: your ID, a selfie holding it, and a selfie holding a handwritten sign. Nothing you submit is ever public.
          </p>
          <div className="card-luxe flex items-start gap-3 p-5">
            {vStatus === 'verified'
              ? <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
              : vStatus === 'pending'
                ? <Clock className="mt-0.5 h-6 w-6 shrink-0 text-gold" />
                : <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-neutral-300" />}
            <div>
              <p className="font-semibold text-charcoal">
                {vStatus === 'verified' ? 'You are verified' : vStatus === 'pending' ? 'Your documents are under review' : vStatus === 'rejected' ? 'Your last submission was not approved' : 'Not verified yet'}
              </p>
              <p className="mt-1 text-sm text-neutral-500">Reviews usually take 1 to 2 days.</p>
              {vStatus !== 'verified' && vStatus !== 'pending' && (
                <Link href="/verification" className="btn-luxe mt-3 inline-flex px-5 py-2.5 text-sm">Start verification</Link>
              )}
            </div>
          </div>
          <p className="text-center text-xs text-neutral-400">You can finish setup now and verify whenever you are ready.</p>
        </div>
      )}

      {step === 7 && (
        <div className="mt-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">
            {live_ ? 'You are live on the map' : 'Almost there'}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
            {live_
              ? 'Clients can find you, see your rates, and request a connection. When one does, you will get a notification.'
              : 'These are the last things the map needs before clients can see you:'}
          </p>
          <div className="card-luxe mt-6 space-y-3 p-5">
            {steps.filter((s) => s.required).map((s, i) => (
              <div key={s.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  {s.done
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    : <span className="h-5 w-5 rounded-full ring-2 ring-neutral-200" />}
                  <span className="text-sm font-medium text-charcoal">{s.label}</span>
                </span>
                {!s.done && (
                  <button onClick={() => setStep([1, 2, 3][i] ?? 1)} className="text-[13px] font-semibold text-primary">Fix</button>
                )}
              </div>
            ))}
          </div>
          {live_ && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link href={username ? `/companion/${username}` : '/profile'} className="btn-luxe py-3 text-center text-sm">View my page</Link>
              <Link href="/" className="btn-soft py-3 text-center text-sm">See the map</Link>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {/* Nav */}
      <div className="fixed inset-x-0 bottom-[calc(61px+env(safe-area-inset-bottom))] z-30 border-t border-black/[0.05] bg-cream/90 backdrop-blur-xl md:bottom-0">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          {step > 0 ? (
            <button onClick={() => setStep((s) => Math.max(0, s - 1))} className="btn-soft flex items-center gap-1 px-4 py-3 text-sm">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : <span className="flex-1" />}
          {step < STEP_TITLES.length - 1 ? (
            <button onClick={next} disabled={saving} className="btn-luxe flex flex-1 items-center justify-center gap-1.5 py-3 text-[15px] disabled:opacity-50">
              {saving ? 'Saving…' : step === 0 ? 'Start setup' : 'Save and continue'} <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <Link href="/dashboard" className="btn-luxe flex-1 py-3 text-center text-[15px]">Go to my dashboard</Link>
          )}
        </div>
      </div>
    </div>
  )
}
