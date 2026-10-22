'use client'

import { StoryManager } from '@/components/stories/StoryManager'
import { TouringPanel } from '@/components/profile/TouringPanel'
import { BoostPanel } from '@/components/profile/BoostPanel';
import { TravelRequirementsPanel } from '@/components/profile/TravelRequirementsPanel';
import { AvatarUploader, GalleryUploader } from '@/components/uploads/PhotoUploader';
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Check,
  Phone,
  Plus,
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
} from '@/lib/icons'
import {
  SERVICE_CATALOG,
  SERVICE_CATEGORIES,
  MAX_CUSTOM_SERVICES,
  customServiceProblem,
  customServiceText,
  isCustomService,
  makeCustomServiceId,
} from '@/lib/services'
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck'
import { ngnForCoins } from '@/lib/utils/helpers'
import { HelpTip } from '@/components/ui/Tooltip'

import { useCities } from '@/lib/citiesLive'
import { coordsFor } from '@/lib/cities'
import { getSetting } from '@/lib/settings/platformSettings'
import { DEFAULT_VIBES, MAX_VIBES, customVibeProblem } from '@/lib/vibes'

/** Screening questions companions ask again and again. One tap adds one to her list. */
const COMMON_QUESTIONS = [
  'What name should I call you?',
  'Hotel or apartment?',
  'When are you looking to meet?',
  'How long do you want to book for?',
  'Is this your first time booking?',
  'Anything you want me to know before we meet?',
] as const

interface ProviderForm {
  displayName: string
  avatarUrl: string
  city: string
  rateShortTime: string
  rateOvernight: string
  rateWeekend: string
  services: string[]
  vibes: string[]
  ratesNegotiable: boolean
  whatsappNumber: string
  bio: string
  galleryUrls: string[]
  showOnMap: boolean
  isAvailable: boolean
  intakeQuestions: string[]
  subPriceCoins: string
}

const EMPTY_FORM: ProviderForm = {
  displayName: '',
  avatarUrl: '',
  city: '',
  rateShortTime: '',
  rateOvernight: '',
  rateWeekend: '',
  services: [],
  vibes: [],
  ratesNegotiable: true,
    whatsappNumber: '',
  bio: '',
  galleryUrls: [],
  showOnMap: true,
  isAvailable: true,
  intakeQuestions: ['', '', ''],
  subPriceCoins: '',
}

function parseRate(v: string): number | null {
  const n = parseInt(v.replace(/[^0-9]/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Fan club price: blank or 0 saves as null, which means fan club off. */
function parseSubPrice(v: string): number | null {
  const n = parseInt(v.replace(/[^0-9]/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export default function ProfilePage() {
  const { cities: CITIES, coordOverrides } = useCities()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bioWarning, setBioWarning] = useState('')
  const [intakeNote, setIntakeNote] = useState('')
  const [customServiceInput, setCustomServiceInput] = useState('')
  const [customServiceMsg, setCustomServiceMsg] = useState('')
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
          'role, display_name, avatar_url, rate_short_time_ngn, rate_overnight_ngn, rate_weekend_ngn, services, vibes, rates_negotiable, gallery_urls, whatsapp_number, bio, intake_questions, sub_price_coins'
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
          vibes: (profile as { vibes?: string[] } | null)?.vibes ?? [],
          ratesNegotiable: profile?.rates_negotiable ?? true,
    whatsappNumber: profile?.whatsapp_number ?? '',
    bio: profile?.bio ?? '',
          galleryUrls: profile?.gallery_urls ?? [],
          showOnMap: presence?.show_on_map ?? true,
          isAvailable: presence?.is_available ?? true,
          intakeQuestions: [0, 1, 2].map(
            (i) =>
              (Array.isArray((profile as any)?.intake_questions)
                ? (profile as any).intake_questions[i]
                : '') ?? ''
          ),
          subPriceCoins: (profile as any)?.sub_price_coins?.toString() ?? '',
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

  // ---- Common screening questions: one tap fills the first free slot ----
  const questionAlreadyAdded = (q: string) =>
    form.intakeQuestions.some((x) => x.trim().toLowerCase() === q.toLowerCase())

  const addCommonQuestion = (q: string) => {
    if (questionAlreadyAdded(q)) {
      setIntakeNote('That question is already in your list.')
      return
    }
    const slot = form.intakeQuestions.findIndex((x) => !x.trim())
    if (slot === -1) {
      setIntakeNote('You already have 3 questions. Clear one above to add this instead.')
      return
    }
    setForm((f) => {
      const next = [...f.intakeQuestions]
      next[slot] = q
      return { ...f, intakeQuestions: next }
    })
    setIntakeNote('')
  }

  // ---- Admin presets: services and vibes maintained in Admin ----
  const [presetServices, setPresetServices] = useState<string[]>([])
  const [presetVibes, setPresetVibes] = useState<string[]>(DEFAULT_VIBES)
  useEffect(() => {
    let live = true
    ;(async () => {
      const [ps, pv] = await Promise.all([
        getSetting<unknown>('preset_services', []),
        getSetting<unknown>('preset_vibes', null),
      ])
      if (!live) return
      if (Array.isArray(ps)) setPresetServices(ps.filter((x): x is string => typeof x === 'string'))
      if (Array.isArray(pv) && pv.length > 0) setPresetVibes(pv.filter((x): x is string => typeof x === 'string'))
    })()
    return () => { live = false }
  }, [])
  const presetServiceIds = new Set(presetServices.map((label) => makeCustomServiceId(label)))

  // ---- Custom services: her own words, stored as "custom:<text>" ----
  const customEntries = form.services.filter((e) => isCustomService(e) && !presetServiceIds.has(e))

  const addCustomService = () => {
    const text = customServiceInput.trim()
    // Fence first: a custom service is companion free text shown on
    // public surfaces, so contact details never get in.
    if (text) {
      const scan = scanForLeaks(text)
      if (!scan.clean) {
        setCustomServiceMsg(leakWarning(scan.leaks))
        return
      }
    }
    const problem = customServiceProblem(text, form.services)
    if (problem) {
      setCustomServiceMsg(problem)
      return
    }
    setForm((f) => ({ ...f, services: [...f.services, makeCustomServiceId(text)] }))
    setCustomServiceInput('')
    setCustomServiceMsg('')
  }

  const removeCustomService = (entry: string) =>
    setForm((f) => ({ ...f, services: f.services.filter((s) => s !== entry) }))

  // ---- Vibes: preset tags or her own words, capped ----
  const [customVibeInput, setCustomVibeInput] = useState('')
  const [customVibeMsg, setCustomVibeMsg] = useState('')
  const toggleVibe = (v: string) => {
    setForm((f) => {
      if (f.vibes.includes(v)) return { ...f, vibes: f.vibes.filter((x) => x !== v) }
      if (f.vibes.length >= MAX_VIBES) return f
      return { ...f, vibes: [...f.vibes, v] }
    })
    setCustomVibeMsg('')
  }
  const addCustomVibe = () => {
    const text = customVibeInput.trim()
    if (!text) return
    const scan = scanForLeaks(text)
    if (!scan.clean) { setCustomVibeMsg(leakWarning(scan.leaks)); return }
    const problem = customVibeProblem(text)
    if (problem) { setCustomVibeMsg(problem); return }
    if (form.vibes.some((v) => v.toLowerCase() === text.toLowerCase())) {
      setCustomVibeMsg('That vibe is already on your list.')
      return
    }
    if (form.vibes.length >= MAX_VIBES) {
      setCustomVibeMsg(`You can show up to ${MAX_VIBES} vibes. Remove one first.`)
      return
    }
    setForm((f) => ({ ...f, vibes: [...f.vibes, text] }))
    setCustomVibeInput('')
    setCustomVibeMsg('')
  }

  const saveProvider = async () => {
    if (!userId) return
    // Fence: display names render on every card, pin, and chat. Scan both.
    const nameScan = scanForLeaks(form.displayName)
    if (!nameScan.clean) {
      setError(`Please remove ${leakWarning(nameScan.leaks).toLowerCase()} from your display name before saving.`)
      return
    }
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
      const [lat, lng] = coordsFor(form.city || 'Lagos', coordOverrides)
      const gallery = form.galleryUrls.filter(Boolean)

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
          vibes: form.vibes,
          rates_negotiable: form.ratesNegotiable,
          whatsapp_number: form.whatsappNumber.trim() || null,
          bio: form.bio.trim() || null,
          gallery_urls: gallery,
          sub_price_coins: parseSubPrice(form.subPriceCoins),
          intake_questions: form.intakeQuestions
            .map((q) => q.trim().slice(0, 120))
            .filter(Boolean)
            .slice(0, 3),
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
      setError('Something went wrong saving your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const saveClient = async () => {
    if (!userId) return
    // Fence: your name is visible to companions, keep contact details off it.
    const nameScan = scanForLeaks(clientName)
    if (!nameScan.clean) {
      setError(`Please remove ${leakWarning(nameScan.leaks).toLowerCase()} from your display name before saving.`)
      return
    }
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
      setError('Something went wrong saving your profile. Please try again.')
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
    'w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-[#AC244D] focus:outline-none focus:ring-2 focus:ring-[#AC244D]/15 md:text-sm'
  const labelCls = 'mb-1.5 block text-sm font-medium text-neutral-700'

  return (
    <div className="mx-auto max-w-3xl space-y-6 font-sans">
      {/* Header */}
      <div className="border-b border-neutral-200/80 pb-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#AC244D]">
          {role === 'model' ? 'Companion Listing' : 'Account'}
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-neutral-900">
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
                <p className="mt-1 text-xs text-neutral-400">{form.bio.length}/500 · No phone numbers or social handles. Clients reach you through Intima.</p>
                {bioWarning && (
                  <p className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {bioWarning}
                  </p>
                )}
              </div>
              <div>
                <label className={labelCls}>Profile photo</label>
                <div className="mt-1 max-w-[220px]">
                  <AvatarUploader
                    userId={userId}
                    value={form.avatarUrl}
                    onChange={(url) => setForm({ ...form, avatarUrl: url })}
                  />
                </div>
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
            <div className="mt-4 flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3">
              <span className="text-sm font-medium text-neutral-700">
                My rates are negotiable
                <span className="block text-xs font-normal text-neutral-500">
                  Clients can propose their own rate, like inDrive
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-label="My rates are negotiable"
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
            </div>
          </div>

          {/* ---- Fan club ---- */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
            <h2 className="mb-4 flex items-center gap-2 font-serif text-lg text-neutral-900">
              <Sparkles className="h-4 w-4 text-[#C9A84C]" /> Fan club
            </h2>
            <div>
              <label className={labelCls}>Monthly price in coins</label>
              <input
                className={inputCls}
                inputMode="numeric"
                value={form.subPriceCoins}
                onChange={(e) => setForm({ ...form, subPriceCoins: e.target.value })}
                placeholder="e.g. 500. Blank or 0 turns your fan club off"
              />
              <p className="mt-1.5 text-xs text-neutral-500">
                Fans pay this many coins per month. You receive your share after the platform cut.
                Leave it blank or 0 to turn your fan club off.
                {Number(form.subPriceCoins) > 0 && (
                  <span className="block">That is {ngnForCoins(Number(form.subPriceCoins))} a month in naira.</span>
                )}
              </p>
            </div>
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
                        className={`inline-flex min-h-[44px] items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all active:scale-95 ${
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
            <div className="mt-5 border-t border-neutral-100 pt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Your own services
              </p>
              <p className="mb-3 text-xs text-neutral-500">
                Offer something that is not on the list? Add it here in your own words. It shows
                on your profile exactly as typed.
              </p>
              {customEntries.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {customEntries.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => removeCustomService(entry)}
                      aria-label={`Remove ${customServiceText(entry)}`}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#C9A84C] bg-[#C9A84C]/10 px-3.5 py-1.5 text-sm font-medium text-neutral-800 transition-all active:scale-95"
                    >
                      {customServiceText(entry)}
                      <X className="h-3.5 w-3.5 text-neutral-500" />
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    className={inputCls}
                    value={customServiceInput}
                    onChange={(e) => setCustomServiceInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addCustomService()
                      }
                    }}
                    placeholder="e.g. Piano serenade"
                    aria-label="Add your own service"
                  />
                </div>
                <button
                  type="button"
                  onClick={addCustomService}
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-[#AC244D] px-4 text-sm font-semibold text-white transition-all hover:bg-[#8F1D40] active:scale-95"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
              <p className="mt-1.5 text-xs text-neutral-400">
                {customEntries.length} of {MAX_CUSTOM_SERVICES} added. Never add phone numbers or
                social handles. Clients reach you through Intima.
              </p>
              {customServiceMsg && (
                <p className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {customServiceMsg}
                </p>
              )}
            </div>
            {presetServices.length > 0 && (
              <div className="mt-5 border-t border-neutral-100 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  More options
                </p>
                <div className="flex flex-wrap gap-2">
                  {presetServices.map((label) => {
                    const id = makeCustomServiceId(label)
                    const active = form.services.includes(id)
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleService(id)}
                        className={`inline-flex min-h-[44px] items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all active:scale-95 ${
                          active
                            ? 'border-[#AC244D] bg-[#AC244D] text-white'
                            : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="mt-5 border-t border-neutral-100 pt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Your vibes
              </p>
              <p className="mb-3 text-xs text-neutral-500">
                Pick the tags that sound like you. They show as gold chips on your profile and in
                your map card.
              </p>
              <div className="flex flex-wrap gap-2">
                {presetVibes.map((v) => {
                  const active = form.vibes.includes(v)
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => toggleVibe(v)}
                      className={`inline-flex min-h-[44px] items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all active:scale-95 ${
                        active
                          ? 'border-[#C9A84C] bg-[#C9A84C] text-charcoal'
                          : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                      }`}
                    >
                      {v}
                    </button>
                  )
                })}
              </div>
              {form.vibes.filter((v) => !presetVibes.includes(v)).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.vibes.filter((v) => !presetVibes.includes(v)).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => toggleVibe(v)}
                      aria-label={`Remove ${v}`}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#C9A84C] bg-[#C9A84C]/10 px-3.5 py-1.5 text-sm font-medium text-neutral-800 transition-all active:scale-95"
                    >
                      {v}
                      <X className="h-3.5 w-3.5 text-neutral-500" />
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <div className="flex-1">
                  <input
                    className={inputCls}
                    value={customVibeInput}
                    onChange={(e) => setCustomVibeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addCustomVibe()
                      }
                    }}
                    placeholder="Or add your own vibe"
                    aria-label="Add your own vibe"
                  />
                </div>
                <button
                  type="button"
                  onClick={addCustomVibe}
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-[#AC244D] px-4 text-sm font-semibold text-white transition-all hover:bg-[#8F1D40] active:scale-95"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
              <p className="mt-1.5 text-xs text-neutral-400">
                {form.vibes.length} of {MAX_VIBES} vibes. Never add phone numbers or social
                handles. Clients reach you through Intima.
              </p>
              {customVibeMsg && (
                <p className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {customVibeMsg}
                </p>
              )}
            </div>
          </div>

          {/* ---- Screening questions ---- */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
            <h2 className="mb-1 flex items-center gap-2 font-serif text-lg text-neutral-900">
              <ShieldCheck className="h-4 w-4 text-[#AC244D]" /> Questions for new clients
              <HelpTip text="Clients answer these questions before your chat opens, so you can screen who reaches you. You can set up to 3 questions. Keep them simple and never ask for contact details." />
            </h2>
            <p className="mb-4 text-xs text-neutral-500">
              Ask up to 3 short questions. Clients answer when they request a connection.
            </p>
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <label className={labelCls}>Question {i + 1}{i > 0 ? ' (optional)' : ''}</label>
                  <input
                    className={inputCls}
                    value={form.intakeQuestions[i] ?? ''}
                    maxLength={120}
                    onChange={(e) =>
                      setForm((f) => {
                        const next = [...f.intakeQuestions]
                        next[i] = e.target.value
                        return { ...f, intakeQuestions: next }
                      })
                    }
                    placeholder={
                      i === 0
                        ? 'e.g. What are you looking for?'
                        : i === 1
                          ? 'e.g. When would you like to meet?'
                          : 'e.g. Anything I should know first?'
                    }
                  />
                </div>
              ))}
            </div>
            <div className="mt-5">
              <p className={labelCls}>Common questions</p>
              <p className="mb-2.5 text-xs text-neutral-500">
                The questions companions ask most. Tap one to add it to your list. You can still
                edit the wording above.
              </p>
              <div className="flex flex-wrap gap-2">
                {COMMON_QUESTIONS.map((q) => {
                  const added = questionAlreadyAdded(q)
                  return (
                    <button
                      key={q}
                      type="button"
                      disabled={added}
                      onClick={() => addCommonQuestion(q)}
                      aria-pressed={added}
                      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
                        added
                          ? 'border-[#AC244D]/30 bg-[#AC244D]/[0.07] text-[#8F1D40]'
                          : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 active:scale-95'
                      }`}
                    >
                      {added && <Check className="h-3.5 w-3.5" />}
                      {q}
                    </button>
                  )
                })}
              </div>
              {intakeNote && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                  {intakeNote}
                </p>
              )}
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              Screening only. Answers stay inside Intima and are checked for contact details before they reach you.
            </p>
          </div>

          {/* ---- Gallery ---- */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
            <h2 className="mb-1 flex items-center gap-2 font-serif text-lg text-neutral-900">
              <ImageIcon className="h-4 w-4 text-[#AC244D]" /> Gallery photos
            </h2>
            <p className="mb-3 text-xs text-neutral-500">
              Add photos straight from your phone. Your profile photo is the cover; these are the rest.
            </p>
            <GalleryUploader
              userId={userId}
              value={form.galleryUrls}
              onChange={(urls) => setForm({ ...form, galleryUrls: urls })}
            />
          </div>

          {/* ---- Visibility ---- */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-xs">
            <h2 className="mb-4 flex items-center gap-2 font-serif text-lg text-neutral-900">
              <Zap className="h-4 w-4 text-[#AC244D]" /> Visibility
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                  {form.showOnMap ? (
                    <Eye aria-hidden className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <EyeOff aria-hidden className="h-4 w-4 text-neutral-400" />
                  )}
                  Show me on the map
                  <span className="block text-xs font-normal text-neutral-500">
                    Turning this off hides you from discovery entirely
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-label="Show me on the map"
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
              </div>
              <div className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3">
                <span className="text-sm font-medium text-neutral-700">
                  Available now
                  <span className="block text-xs font-normal text-neutral-500">
                    Green dot on your pin and profile
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-label="Available now"
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
              </div>
            </div>
          </div>

          <TouringPanel />

          <TravelRequirementsPanel />

          <BoostPanel />

          {/* Save */}
          <button
            onClick={saveProvider}
            disabled={saving}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-[#AC244D] py-3.5 text-sm font-semibold text-white transition-all hover:bg-[#8F1D40] active:scale-[0.99] disabled:opacity-60"
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
              <label className={labelCls}>Your photo</label>
              <div className="mt-1 max-w-[220px]">
                <AvatarUploader userId={userId} value={clientAvatar} onChange={setClientAvatar} />
              </div>
            </div>
            <button
              onClick={saveClient}
              disabled={saving}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-[#AC244D] py-3 text-sm font-semibold text-white transition-all hover:bg-[#8F1D40] active:scale-[0.99] disabled:opacity-60"
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
