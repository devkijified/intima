'use client'

import { StoryManager } from '@/components/stories/StoryManager';
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Check,
  Phone,
  X,
  Loader2,
  MapPin,
  ShieldCheck,
  Camera,
  Tag,
  Sparkles,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Zap,
} from 'lucide-react'
import { SERVICE_CATALOG, SERVICE_CATEGORIES } from '@/lib/services'
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck'

const CITIES = ['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano', 'Enugu'] as const

/** Approximate city centers for area-level pins. [lat, lng]. */
const CITY_COORDS: Record<string, [number, number]> = {
  Lagos: [6.5244, 3.3792],
  Abuja: [9.0579, 7.4951],
  'Port Harcourt': [4.7714, 6.9962],
  Ibadan: [7.3775, 3.947],
  Kano: [12.0022, 8.5167],
  Enugu: [6.4584, 7.4951],
}

interface ProviderForm {
  displayName: string
  avatarUrl: string
  city: string
  rateShortTime: string
  rateOvernight: string
  rateWeekend: string
  services: string[]
  ratesNegotiable: boolean
  whatsappNumber: string
  bio: string
  galleryUrls: string
  showOnMap: boolean
  isAvailable: boolean
}

const EMPTY_FORM: ProviderForm = {
  displayName: '',
  avatarUrl: '',
  city: '',
  rateShortTime: '',
  rateOvernight: '',
  rateWeekend: '',
  services: [],
  ratesNegotiable: true,
    whatsappNumber: '',
  bio: '',
  galleryUrls: '',
  showOnMap: true,
  isAvailable: true,
}

function parseRate(v: string): number | null {
  const n = parseInt(v.replace(/[^0-9]/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bioWarning, setBioWarning] = useState('')
  const [savedTick, setSavedTick] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState<string>('client')
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM)
  // Client-only fields
  const [clientName, setClientName] = useState('')
  const [clientAvatar, setClientAvatar] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'role, display_name, avatar_url, rate_short_time_ngn, rate_overnight_ngn, rate_weekend_ngn, services, rates_negotiable, gallery_urls, whatsapp_number, bio'
        )
        .eq('id', user.id)
        .maybeSingle()

      const r = profile?.role ?? user.user_metadata?.role ?? 'client'
      setRole(r)

      if (r === 'model') {
        const { data: presence } = await supabase
          .from('provider_presence')
          .select('city, show_on_map, is_available')
          .eq('provider_id', user.id)
          .maybeSingle()

        setForm({
          displayName: profile?.display_name ?? '',
          avatarUrl: profile?.avatar_url ?? '',
          city: presence?.city ?? '',
          rateShortTime: profile?.rate_short_time_ngn?.toString() ?? '',
          rateOvernight: profile?.rate_overnight_ngn?.toString() ?? '',
          rateWeekend: profile?.rate_weekend_ngn?.toString() ?? '',
          services: profile?.services ?? [],
          ratesNegotiable: profile?.rates_negotiable ?? true,
    whatsappNumber: profile?.whatsapp_number ?? '',
    bio: profile?.bio ?? '',
          galleryUrls: (profile?.gallery_urls ?? []).join('\n'),
          showOnMap: presence?.show_on_map ?? true,
          isAvailable: presence?.is_available ?? true,
        })
      } else {
        setClientName(profile?.display_name ?? '')
        setClientAvatar(profile?.avatar_url ?? '')
      }

      setLoading(false)
    }
    load()
  }, [supabase])

  // ---- Completeness (provider) ----
  const checks = [
    { label: 'Display name', done: form.displayName.trim().length > 0 },
    { label: 'Profile photo', done: form.avatarUrl.trim().length > 0 },
    { label: 'City', done: form.city.length > 0 },
    {
      label: 'At least one rate',
      done:
        parseRate(form.rateShortTime) !== null ||
        parseRate(form.rateOvernight) !== null ||
        parseRate(form.rateWeekend) !== null,
    },
    { label: 'At least one service', done: form.services.length > 0 },
  ]
  const doneCount = checks.filter((c) => c.done).length
  const complete = doneCount === checks.length

  const toggleService = (id: string) =>
    setForm((f) => ({
      ...f,
      services: f.services.includes(id)
        ? f.services.filter((s) => s !== id)
        : [...f.services, id],
    }))

  const saveProvider = async () => {
    if (!userId) return
    const scan = scanForLeaks(form.bio)
    if (!scan.clean) {
      setBioWarning(leakWarning(scan.leaks))
      setError('Please remove contact details from your bio before saving.')
      return
    }
    setBioWarning('')
    setSaving(true)
    setError(null)
    try {
      const [lat, lng] = form.city ? CITY_COORDS[form.city] ?? [6.5244, 3.3792] : [6.5244, 3.3792]
      const gallery = form.galleryUrls
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean)

      const { error: pErr } = await supabase.from('profiles').upsert(
        {
          id: userId,
          role: 'model',
          display_name: form.displayName.trim() || null,
          avatar_url: form.avatarUrl.trim() || null,
          rate_short_time_ngn: parseRate(form.rateShortTime),
          rate_overnight_ngn: parseRate(form.rateOvernight),
          rate_weekend_ngn: parseRate(form.rateWeekend),
          services: form.services,
          rates_negotiable: form.ratesNegotiable,
          whatsapp_number: form.whatsappNumber.trim() || null,
          bio: form.bio.trim() || null,
          gallery_urls: gallery,
        },
        { onConflict: 'id' }
      )
      if (pErr) throw pErr

      const { error: prErr } = await supabase.from('provider_presence').upsert(
        {
          provider_id: userId,
          city: form.city || 'Lagos',
          area_lat: lat,
          area_lng: lng,
          show_on_map: form.showOnMap,
          is_available: form.isAvailable,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider_id' }
      )
      if (prErr) throw prErr

      setSavedTick(true)
      setTimeout(() => setSavedTick(false), 2500)
    } catch (e: any) {
      setError(e.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const saveClient = async () => {
    if (!userId) return
    setSaving(true)
    setError(null)
    try {
      const { error: pErr } = await supabase.from('profiles').upsert(
        {
          id: userId,
          display_name: clientName.trim() || null,
          avatar_url: clientAvatar.trim() || null,
        },
        { onConflict: 'id' }
      )
      if (pErr) throw pErr
      setSavedTick(true)
      setTimeout(() => setSavedTick(false), 2500)
    } catch (e: any) {
      setError(e.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#AC244D] border-t-transparent"></div>
          <p className="mt-3 text-sm font-medium text-neutral-500 font-sans">Loading your profile...</p>
        </div>
      </div>
    )
  }

  const inputCls =
    'w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#AC244D] focus:outline-none focus:ring-2 focus:ring-[#AC244D]/15'
  const labelCls = 'mb-1.5 block text-sm font-medium text-neutral-700'

  return (
    <div className="mx-auto max-w-3xl space-y-6 font-sans">
      {/* Header */}
      <div className="border-b border-neutral-200/80 pb-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#AC244D]">
          {role === 'model' ? 'Companion Listing' : 'Account'}
        </p>
        <h1 className="font-serif text-3xl font-normal tracking-tight text-neutral-900">
          {role === 'model' ? 'My Public Profile' : 'My Profile'}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {role === 'model'
            ? 'This is what guests see on the map and in your profile sheet.'
            : 'Your personal details.'}
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {role === 'model' ? (
        <>
          {/* ---- Completeness checklist ---- */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-lg text-neutral-900">Profile completeness</h2>
              <span className="text-sm font-semibold text-[#AC244D]">
                {doneCount}/5
              </span>
            </div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-[#AC244D] transition-all"
                style={{ width: `${(doneCount / 5) * 100}%` }}
              />
            </div>
            <ul className="space-y-2">
              {checks.map((c) => (
                <li key={c.label} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full ${
                      c.done ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-400'
                    }`}
                  >
                    {c.done ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  </span>
                  <span className={c.done ? 'text-neutral-700' : 'text-neutral-400'}>{c.label}</span>
                </li>
              ))}
            </ul>
            {!complete ? (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                Your profile stays hidden from discovery until all five are done. Finish the missing
                pieces and you appear on the map automatically.
              </p>
            ) : (
              <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
                Your profile is complete and visible in discovery.
              </p>
            )}
          </div>

          {/* ---- Basics ---- */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
            <h2 className="mb-4 flex items-center gap-2 font-serif text-lg text-neutral-900">
              <Camera className="h-4 w-4 text-[#AC244D]" /> Basics
            </h2>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Display name</label>
                <input
                  className={inputCls}
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="e.g. Adaeze"
                />
              </div>
              <div>
                <label className={labelCls}>Bio</label>
                <textarea
                  className={`${inputCls} min-h-[96px]`}
                  value={form.bio}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm({ ...form, bio: v })
                    const scan = scanForLeaks(v)
                    setBioWarning(scan.clean ? '' : leakWarning(scan.leaks))
                  }}
                  placeholder="Tell clients about yourself, your vibe, what to expect..."
                  maxLength={500}
                />
                <p className="mt-1 text-xs text-neutral-400">{form.bio.length}/500 · No phone numbers or social handles — clients reach you through Intima.</p>
                {bioWarning && (
                  <p className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {bioWarning}
                  </p>
                )}
              </div>
              <div>
                <label className={labelCls}>Profile photo URL</label>
                <input
                  className={inputCls}
                  value={form.avatarUrl}
                  onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
                  placeholder="https://..."
                />
                {form.avatarUrl.trim() && (
                  <img
                    src={form.avatarUrl.trim()}
                    alt="Profile preview"
                    className="mt-2 h-20 w-20 rounded-2xl object-cover"
                  />
                )}
              </div>
              <div>
                <label className={labelCls}>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-[#AC244D]" /> City
                  </span>
                </label>
                <select
                  className={inputCls}
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                >
                  <option value="">Select a city</option>
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-neutral-500">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#AC244D]" />
                  Area location only, never an exact address. Your pin is placed at a
                  jittered area point within the city.
                </p>
              </div>
            </div>
          </div>


          {/* ---- WhatsApp ---- */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
            <h2 className="mb-4 flex items-center gap-2 font-serif text-lg text-neutral-900">
              <Phone className="h-4 w-4 text-[#128C4B]" /> WhatsApp
            </h2>
            <div>
              <label className={labelCls}>WhatsApp number</label>
              <input
                className={inputCls}
                inputMode="tel"
                value={form.whatsappNumber}
                onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
                placeholder="e.g. 2348012345678"
              />
              <p className="mt-1.5 text-xs text-neutral-500">
                Only clients with an active (paid) connection can see this. Never shown on your public profile or the map.
              </p>
            </div>
          </div>

          <StoryManager />

          {/* ---- Rates ---- */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
            <h2 className="mb-4 flex items-center gap-2 font-serif text-lg text-neutral-900">
              <Tag className="h-4 w-4 text-[#AC244D]" /> Rates (₦)
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Short time</label>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={form.rateShortTime}
                  onChange={(e) => setForm({ ...form, rateShortTime: e.target.value })}
                  placeholder="e.g. 50000"
                />
              </div>
              <div>
                <label className={labelCls}>Overnight</label>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={form.rateOvernight}
                  onChange={(e) => setForm({ ...form, rateOvernight: e.target.value })}
                  placeholder="e.g. 150000"
                />
              </div>
              <div>
                <label className={labelCls}>Weekend</label>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={form.rateWeekend}
                  onChange={(e) => setForm({ ...form, rateWeekend: e.target.value })}
                  placeholder="e.g. 400000"
                />
              </div>
            </div>
            <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 px-4 py-3">
              <span className="text-sm font-medium text-neutral-700">
                My rates are negotiable
                <span className="block text-xs font-normal text-neutral-500">
                  Clients can propose their own rate, like inDrive
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={form.ratesNegotiable}
                onClick={() => setForm({ ...form, ratesNegotiable: !form.ratesNegotiable })}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  form.ratesNegotiable ? 'bg-[#AC244D]' : 'bg-neutral-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    form.ratesNegotiable ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </label>
          </div>

          {/* ---- Services ---- */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
            <h2 className="mb-1 flex items-center gap-2 font-serif text-lg text-neutral-900">
              <Sparkles className="h-4 w-4 text-[#AC244D]" /> Services offered
            </h2>
            <p className="mb-4 text-xs text-neutral-500">
              Only select what you actually offer. Call buttons on your profile follow this list.
            </p>
            {SERVICE_CATEGORIES.map((cat) => (
              <div key={cat} className="mb-4 last:mb-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  {cat}
                </p>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_CATALOG.filter((s) => s.category === cat).map((s) => {
                    const active = form.services.includes(s.id)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleService(s.id)}
                        className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all active:scale-95 ${
                          active
                            ? 'border-[#AC244D] bg-[#AC244D] text-white'
                            : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                        }`}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* ---- Gallery ---- */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
            <h2 className="mb-1 flex items-center gap-2 font-serif text-lg text-neutral-900">
              <ImageIcon className="h-4 w-4 text-[#AC244D]" /> Gallery photos
            </h2>
            <p className="mb-3 text-xs text-neutral-500">
              One photo URL per line. Your profile photo is the cover; these are the rest.
            </p>
            <textarea
              className={`${inputCls} min-h-[110px] font-mono text-xs`}
              value={form.galleryUrls}
              onChange={(e) => setForm({ ...form, galleryUrls: e.target.value })}
              placeholder={'https://.../photo1.jpg\nhttps://.../photo2.jpg'}
            />
          </div>

          {/* ---- Visibility ---- */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
            <h2 className="mb-4 flex items-center gap-2 font-serif text-lg text-neutral-900">
              <Zap className="h-4 w-4 text-[#AC244D]" /> Visibility
            </h2>
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                  {form.showOnMap ? (
                    <Eye className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-neutral-400" />
                  )}
                  Show me on the map
                  <span className="block text-xs font-normal text-neutral-500">
                    Turning this off hides you from discovery entirely
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.showOnMap}
                  onClick={() => setForm({ ...form, showOnMap: !form.showOnMap })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    form.showOnMap ? 'bg-[#AC244D]' : 'bg-neutral-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      form.showOnMap ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 px-4 py-3">
                <span className="text-sm font-medium text-neutral-700">
                  Available now
                  <span className="block text-xs font-normal text-neutral-500">
                    Green dot on your pin and profile
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.isAvailable}
                  onClick={() => setForm({ ...form, isAvailable: !form.isAvailable })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    form.isAvailable ? 'bg-emerald-500' : 'bg-neutral-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      form.isAvailable ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {/* Save */}
          <button
            onClick={saveProvider}
            disabled={saving}
            className="w-full rounded-full bg-[#AC244D] py-3.5 text-sm font-semibold text-white transition-all hover:bg-[#8F1D40] active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Saving...
              </span>
            ) : savedTick ? (
              <span className="inline-flex items-center gap-2">
                <Check className="h-4 w-4" /> Saved
              </span>
            ) : (
              'Save profile'
            )}
          </button>
        </>
      ) : (
        /* ================= CLIENT VIEW ================= */
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Display name</label>
              <input
                className={inputCls}
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="What should companions call you?"
              />
            </div>
            <div>
              <label className={labelCls}>Avatar URL</label>
              <input
                className={inputCls}
                value={clientAvatar}
                onChange={(e) => setClientAvatar(e.target.value)}
                placeholder="https://..."
              />
              {clientAvatar.trim() && (
                <img
                  src={clientAvatar.trim()}
                  alt="Avatar preview"
                  className="mt-2 h-20 w-20 rounded-full object-cover"
                />
              )}
            </div>
            <button
              onClick={saveClient}
              disabled={saving}
              className="w-full rounded-full bg-[#AC244D] py-3 text-sm font-semibold text-white transition-all hover:bg-[#8F1D40] active:scale-[0.99] disabled:opacity-60"
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </span>
              ) : savedTick ? (
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4" /> Saved
                </span>
              ) : (
                'Save profile'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
