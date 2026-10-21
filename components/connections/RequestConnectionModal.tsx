'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ShieldCheck, Phone, Video, MessageCircle, Loader2, CheckCircle2, AlertTriangle } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { getConnectionFeeNgn } from '@/lib/settings/platformSettings'
import { getPaymentProvider, newPaymentReference } from '@/lib/payments/provider'
import { formatPrice, formatCompactPrice, getInitials } from '@/lib/utils/helpers'
import { isCustomService, resolveServices } from '@/lib/services'
import {
  RATE_SERVICE_TYPES,
  serviceTypeForSlug,
  type ServiceType,
} from '@/lib/connections/serviceType'
import { HelpTip } from '@/components/ui/Tooltip'

interface RequestConnectionModalProps {
  providerId: string
  providerName: string
  providerAvatarUrl?: string | null
  /** False = her rates are fixed; no offer input is shown. */
  ratesNegotiable?: boolean
  /** Her listed short-time rate, shown as the anchor for offers. */
  anchorRateNgn?: number | null
  onClose: () => void
  onConnected: () => void
}

type Step = 'summary' | 'processing' | 'success' | 'error' | 'unavailable'

/**
 * One selectable "what do you want?" chip, derived from her data
 * only: a priced rate she set, or a service she offers. `key` is
 * unique per chip (two services can share the stored 'other' key);
 * `serviceType` is what gets stored on the connection.
 */
interface WantOption {
  key: string
  label: string
  priceNgn: number | null
  serviceType: ServiceType
}

interface SimilarProvider {
  providerId: string
  username: string | null
  name: string
  avatar: string | null
  city: string | null
  rateShortTime: number | null
  services: string[]
}

export function RequestConnectionModal({
  providerId,
  providerName,
  providerAvatarUrl,
  ratesNegotiable = true,
  anchorRateNgn = null,
  onClose,
  onConnected,
}: RequestConnectionModalProps) {
  const [fee, setFee] = useState<number | null>(null)
  const [step, setStep] = useState<Step>('summary')
  const [error, setError] = useState('')
  /** inDrive-style: client proposes a rate when she is open to offers. */
  const [proposedRate, setProposedRate] = useState('')
  const [similar, setSimilar] = useState<SimilarProvider[]>([])
  const [activeId, setActiveId] = useState(providerId)
  const [activeName, setActiveName] = useState(providerName)
  const [activeAvatar, setActiveAvatar] = useState<string | null>(providerAvatarUrl ?? null)
  const [eligibility, setEligibility] = useState<{ eligible: boolean; checks: { key: string; label: string; ok: boolean; have: string }[] } | null>(null)
  const [cardEnabled, setCardEnabled] = useState(false)
  const [transferEnabled, setTransferEnabled] = useState(false)
  const [intakeQuestions, setIntakeQuestions] = useState<string[]>([])
  const [intakeAnswers, setIntakeAnswers] = useState<string[]>([])
  /** False until her profile (questions, rates, services) has loaded. */
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [wantOptions, setWantOptions] = useState<WantOption[]>([])
  const [selectedWant, setSelectedWant] = useState<string | null>(null)
  /** The last value the chip picker itself put in the offer box. */
  const prefillRef = useRef('')
  const supabase = createClient()

  const selectedOption = wantOptions.find((o) => o.key === selectedWant) ?? null

  /** Pick a "what do you want?" chip; a priced pick anchors the offer box on her rate. */
  function pickWant(option: WantOption) {
    setSelectedWant(option.key)
    if (!ratesNegotiable) return
    if (option.priceNgn !== null) {
      const value = String(option.priceNgn)
      prefillRef.current = value
      setProposedRate(value)
    } else {
      // A priceless pick drops our own prefill, never the client's typing.
      setProposedRate((cur) => (cur === prefillRef.current ? '' : cur))
      prefillRef.current = ''
    }
  }

  useEffect(() => {
    fetch('/api/coins/methods')
      .then((r) => (r.ok ? r.json() : { card: false }))
      .then((d) => {
        setCardEnabled(!!d.card)
        setTransferEnabled(!!d.transfer)
      })
      .catch(() => setCardEnabled(false))
  }, [])

  // Bybit-style pre-check: never let an unqualified client reach payment.
  useEffect(() => {
    let cancelled = false
    setEligibility(null)
    fetch(`/api/connections?provider_id=${activeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setEligibility(data)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [activeId])

  // Her screening questions: clients answer before paying. The same
  // fetch brings her rates and services, which build the "what do
  // you want?" chips: nothing is offered here that she does not sell.
  useEffect(() => {
    let cancelled = false
    setProfileLoaded(false)
    setIntakeQuestions([])
    setIntakeAnswers([])
    setWantOptions([])
    setSelectedWant(null)
    prefillRef.current = ''
    supabase
      .from('profiles')
      .select('intake_questions, rate_short_time_ngn, rate_overnight_ngn, rate_weekend_ngn, services')
      .eq('id', activeId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const d = data as {
          intake_questions?: unknown
          rate_short_time_ngn?: number | null
          rate_overnight_ngn?: number | null
          rate_weekend_ngn?: number | null
          services?: string[] | null
        } | null
        const raw = d?.intake_questions
        const qs = Array.isArray(raw)
          ? raw.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, 3)
          : []
        setIntakeQuestions(qs)
        setIntakeAnswers(qs.map(() => ''))
        setProfileLoaded(true)

        // Chips: one per priced rate she set, then one per service
        // she offers that is not itself a rate key. The rate keys are
        // represented by their priced rate chips alone, so an
        // overnight never appears twice.
        const options: WantOption[] = []
        const rateRows: Array<{ key: ServiceType; label: string; rate: number | null | undefined }> = [
          { key: 'short_time', label: 'Short time', rate: d?.rate_short_time_ngn },
          { key: 'overnight', label: 'Overnight', rate: d?.rate_overnight_ngn },
          { key: 'weekend', label: 'Weekend', rate: d?.rate_weekend_ngn },
        ]
        for (const row of rateRows) {
          if (typeof row.rate === 'number' && row.rate > 0) {
            options.push({ key: row.key, label: row.label, priceNgn: row.rate, serviceType: row.key })
          }
        }
        for (const def of resolveServices(d?.services)) {
          if (RATE_SERVICE_TYPES.has(def.id)) continue
          options.push({
            key: `svc:${def.id}`,
            label: def.label,
            priceNgn: null,
            // A custom service ("custom:<text>") has no service_type
            // key of its own: the chip shows her text, but the wire
            // value is 'other'. The connections route and the
            // database CHECK accept only the fixed key list, so the
            // raw custom text must never be sent as service_type.
            serviceType: isCustomService(def.id) ? 'other' : serviceTypeForSlug(def.id),
          })
        }
        setWantOptions(options)

        // Default: short time when she prices it, else her first option.
        const fallback = options.find((o) => o.key === 'short_time') ?? options[0] ?? null
        if (fallback) {
          setSelectedWant(fallback.key)
          if (ratesNegotiable && fallback.priceNgn !== null) {
            const value = String(fallback.priceNgn)
            prefillRef.current = value
            setProposedRate((cur) => (cur === '' ? value : cur))
          }
        }
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  const intakeComplete =
    intakeQuestions.length === 0 ||
    intakeQuestions.every((_, i) => (intakeAnswers[i] ?? '').trim().length > 0)

  // The smart offer box. Everything keys off her rate for the
  // current pick: what the client typed wins, and an empty or
  // invalid box falls back to her full rate, which is also the
  // value that gets sent as the offer.
  const baseRate = selectedOption?.priceNgn ?? null
  const typedOffer = parseInt(proposedRate.replace(/[^0-9]/g, ''), 10)
  const typedOfferValid = Number.isFinite(typedOffer) && typedOffer > 0
  const effectiveOffer = typedOfferValid ? typedOffer : baseRate

  /** Round an offer DOWN to a clean step, never below ₦1,000. */
  const roundOfferDown = (n: number): number => {
    const step = n >= 100000 ? 5000 : 1000
    return Math.max(1000, Math.floor(n / step) * step)
  }

  const quickOffers: Array<{ label: string; value: number }> = []
  if (baseRate !== null) {
    const seen = new Set<number>()
    const candidates: Array<{ label: string; value: number }> = [
      { label: 'Her rate', value: baseRate },
      { label: '10% off', value: roundOfferDown(baseRate * 0.9) },
      { label: '20% off', value: roundOfferDown(baseRate * 0.8) },
      { label: '30% off', value: roundOfferDown(baseRate * 0.7) },
    ]
    for (const c of candidates) {
      if (c.value > baseRate || c.value <= 0 || seen.has(c.value)) continue
      seen.add(c.value)
      quickOffers.push(c)
    }
  }

  const offerPct =
    baseRate !== null && effectiveOffer !== null
      ? (effectiveOffer / baseRate) * 100
      : null
  const offerFeedback =
    offerPct === null
      ? null
      : offerPct >= 100
        ? 'Her full rate'
        : offerPct >= 85
          ? 'Strong offer, likely to be accepted'
          : offerPct >= 70
            ? 'Fair offer, she may accept or think it over'
            : offerPct >= 50
              ? 'Low offer, acceptance is unlikely'
              : 'Very low, most companions ignore offers this low'
  const offerDelta =
    baseRate !== null && effectiveOffer !== null ? effectiveOffer - baseRate : 0

  /** Switch the modal to a recommended companion (fee already paid). */
  function onPickSimilar(sp: SimilarProvider) {
    setProfileLoaded(false)
    setActiveId(sp.providerId)
    setActiveName(sp.name)
    setActiveAvatar(sp.avatar)
    setSimilar([])
    setProposedRate('')
    setIntakeAnswers([])
    setStep('summary')
  }

  useEffect(() => {
    let cancelled = false
    getConnectionFeeNgn().then((value) => {
      if (!cancelled) setFee(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /** Similar available companions: same city first, overlapping services. */
  async function findSimilar(currentId: string, city: string | null): Promise<SimilarProvider[]> {
    const { data: me } = await supabase
      .from('profiles')
      .select('services')
      .eq('id', currentId)
      .maybeSingle()
    const myServices: string[] = Array.isArray(me?.services) ? me.services : []

    let q = supabase
      .from('map_providers')
      .select('provider_id, username, display_name, avatar_url, city, rate_short_time_ngn, services')
      .eq('is_available', true)
      .neq('provider_id', currentId)
      .limit(20)
    if (city) q = q.eq('city', city)
    const { data } = await q
    if (!data) return []

    const scored = data.map((r: any) => {
      const svc: string[] = Array.isArray(r.services) ? r.services : []
      const overlap = myServices.length > 0 ? svc.filter((x) => myServices.includes(x)).length : 0
      return {
        providerId: r.provider_id,
        username: r.username ?? null,
        name: r.display_name ?? 'Intima companion',
        avatar: r.avatar_url ?? null,
        city: r.city ?? null,
        rateShortTime: r.rate_short_time_ngn ?? null,
        services: svc,
        score: overlap,
      }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 3).map(({ score, ...rest }) => rest)
  }

  /** Everything after a payment lands, shared by the card and crypto rails. */
  async function completeBooking(paymentRef: string) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Please sign in to request a connection.')
      }
      void user

      // Availability check after payment: if she is offline, recommend similar providers.
      const { data: presence } = await supabase
        .from('provider_presence')
        .select('is_available, city')
        .eq('provider_id', activeId)
        .maybeSingle()
      if (presence && presence.is_available === false) {
        const picks = await findSimilar(activeId, presence.city ?? null)
        setSimilar(picks)
        setStep('unavailable')
        return
      }

      // The offer that actually goes out: what the client typed, or
      // her full rate for the pick when the box was left empty.
      const offerToSend = !ratesNegotiable
        ? null
        : typedOfferValid
          ? typedOffer
          : baseRate

      // The server re-checks her requirements and the fee, then creates
      // the connection. A 403 here means the client does not qualify.
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: activeId,
          payment_ref: paymentRef,
          proposed_rate_ngn: offerToSend,
          service_type: selectedOption?.serviceType ?? undefined,
          intakeAnswers:
            intakeQuestions.length > 0
              ? intakeQuestions.map((q, i) => ({ q, a: (intakeAnswers[i] ?? '').trim() }))
              : undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Could not create the connection. Please try again.')
      }

      setStep('success')
      onConnected()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStep('error')
    }
  }

  async function handlePay() {
    if (fee === null) return
    setStep('processing')
    setError('')
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Please sign in to request a connection.')

      const provider = getPaymentProvider()
      const reference = newPaymentReference()
      const init = await provider.initialize(fee, reference, {
        client_id: user.id,
        provider_id: activeId,
        kind: 'connection_fee',
      })
      const status = await provider.verify(init.reference)
      if (status !== 'paid') {
        throw new Error('Payment was not completed. Please try again.')
      }
      await completeBooking(init.reference)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStep('error')
    }
  }

  /**
   * Card rail (Paystack): initialize server-side, then hand the browser
   * to the hosted checkout. The /payments/callback page verifies and
   * creates the connection when Paystack returns the client.
   */
  async function handleCardPay(channel?: 'bank_transfer') {
    setError('')
    try {
      // The card rail leaves the page. The answers and the service
      // pick go to the server with the initialize call and are stored
      // on the payment row (server-side truth); the sessionStorage
      // stash below stays as a fallback for the callback.
      try {
        if (intakeQuestions.length > 0) {
          sessionStorage.setItem(
            `intima_intake_${activeId}`,
            JSON.stringify(intakeQuestions.map((q, i) => ({ q, a: (intakeAnswers[i] ?? '').trim() })))
          )
        }
        if (selectedOption) {
          sessionStorage.setItem(`intima_service_${activeId}`, selectedOption.serviceType)
        }
      } catch { /* storage unavailable: the server copy still carries them */ }
      const res = await fetch('/api/payments/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: activeId,
          ...(channel ? { channel } : {}),
          ...(intakeQuestions.length > 0
            ? {
                intakeAnswers: intakeQuestions.map((q, i) => ({
                  q,
                  a: (intakeAnswers[i] ?? '').trim(),
                })),
              }
            : {}),
          ...(selectedOption ? { service_type: selectedOption.serviceType } : {}),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.authorizationUrl) {
        throw new Error(data?.error || 'Could not start card checkout.')
      }
      window.location.href = data.authorizationUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStep('error')
    }
  }

  /**
   * Crypto rail: open the hosted invoice in a new tab, then poll our
   * status endpoint (driven by the gateway webhook) until it lands.
   */
  async function handleCryptoPay() {
    setStep('processing')
    setError('')
    try {
      const res = await fetch('/api/payments/crypto/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'connection_fee', provider_id: activeId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.invoiceUrl || !data?.reference) {
        throw new Error(data?.error || 'Could not start crypto checkout.')
      }
      window.open(data.invoiceUrl, '_blank', 'noopener')
      const deadline = Date.now() + 10 * 60 * 1000
      for (;;) {
        await new Promise((r) => setTimeout(r, 4000))
        const st = await fetch(`/api/payments/crypto/status?ref=${data.reference}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
        if (st?.status === 'finished') {
          await completeBooking(data.reference)
          return
        }
        if (st?.status === 'failed' || st?.status === 'expired') {
          throw new Error('The crypto payment did not complete. Please try again.')
        }
        if (Date.now() > deadline) {
          throw new Error('Still waiting for the network to confirm. Your booking completes automatically once it does.')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStep('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        e.stopPropagation()
        if (step !== 'processing') onClose()
      }}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6 shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-xl font-bold text-charcoal">Request connection</h2>
          <button
            onClick={onClose}
            disabled={step === 'processing'}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-gray-400 hover:text-gray-600 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {step === 'summary' && (
          <>
            <div className="flex items-center gap-4 mb-5">
              {activeAvatar ? (
                <img
                  src={activeAvatar}
                  alt={activeName}
                  className="w-16 h-16 rounded-full object-cover border-2 border-primary/20"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary-muted flex items-center justify-center text-primary font-bold text-xl">
                  {getInitials(activeName)}
                </div>
              )}
              <div>
                <p className="font-semibold text-charcoal">{activeName}</p>
                <p className="text-sm text-gray-500">Verified provider</p>
              </div>
            </div>

            <div className="bg-cream rounded-2xl p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-1 text-sm text-gray-600">
                  Connection fee
                  <HelpTip text={`This one fee opens your private chat with ${activeName}, plus voice and video calls. It is the only charge Intima takes on the booking; the companion keeps all of their own rate. If anything goes wrong, you can open a dispute within 24 hours and the fee can be refunded.`} />
                </span>
                <span className="font-display text-2xl font-bold text-primary">
                  {fee === null ? '...' : formatPrice(fee)}
                </span>
              </div>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <MessageCircle className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                  <span>Unlocks in-platform chat with {activeName}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Phone className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                  <span>Unlocks voice and video calls</span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                  <span>She keeps 100% of her own rates. This fee is the only platform charge.</span>
                </li>
              </ul>
            </div>

            {wantOptions.length > 0 && (
              <div className="mb-5">
                <p className="text-sm font-medium text-charcoal">What do you want?</p>
                <p className="text-xs text-gray-500 mt-0.5 mb-2">
                  Pick one. She sees it with your offer, and you settle the details in chat.
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="What do you want?">
                  {wantOptions.map((option) => {
                    const active = option.key === selectedWant
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => pickWant(option)}
                        aria-pressed={active}
                        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                          active
                            ? 'border-primary bg-primary text-white'
                            : 'border-gray-200 bg-white text-charcoal hover:border-primary/50'
                        }`}
                      >
                        {option.label}
                        {option.priceNgn !== null && (
                          <span className={active ? 'text-white/80' : 'text-gray-400'}>
                            {formatCompactPrice(option.priceNgn)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-5">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-800">
                Test mode: no real money moves. The live payment rail plugs in here after legal review.
              </p>
            </div>

            {ratesNegotiable ? (
              <div className="mb-5">
                <label htmlFor="proposed-rate" className="text-sm font-medium text-charcoal">
                  Propose your rate <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <p className="text-xs text-gray-500 mt-0.5 mb-2">
                  {baseRate !== null ? (
                    <>
                      Her rate for this is{' '}
                      <strong className="text-charcoal">{formatCompactPrice(baseRate)}</strong>.
                      Keep it to accept her rate, or change it to make your own offer.
                    </>
                  ) : selectedOption !== null ? (
                    'She has not listed a rate for this one. Propose what works for you.'
                  ) : anchorRateNgn !== null ? (
                    <>
                      She is open to offers, her listed short time is {formatPrice(anchorRateNgn)}.
                      Leave blank to accept her rates.
                    </>
                  ) : (
                    'She is open to offers. Leave blank to accept her rates.'
                  )}
                </p>
                {quickOffers.length > 1 && (
                  <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Quick offers">
                    {quickOffers.map((chip) => {
                      const active = effectiveOffer === chip.value
                      return (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => {
                            prefillRef.current = String(chip.value)
                            setProposedRate(String(chip.value))
                          }}
                          aria-pressed={active}
                          aria-label={`Offer ${chip.label === 'Her rate' ? 'her full rate' : chip.label}, ${formatCompactPrice(chip.value)}`}
                          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                            active
                              ? 'border-primary bg-primary text-white'
                              : 'border-gray-200 bg-white text-charcoal hover:border-primary/50'
                          }`}
                        >
                          {chip.label}
                          <span className={active ? 'text-white/80' : 'text-gray-400'}>
                            {formatCompactPrice(chip.value)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₦</span>
                  <input
                    id="proposed-rate"
                    type="text"
                    inputMode="numeric"
                    value={proposedRate}
                    onChange={(e) => setProposedRate(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="e.g. 100000"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-9 pr-20 text-base text-charcoal outline-none focus:border-primary focus:bg-white transition-colors"
                  />
                  {typedOfferValid && (
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">
                      {formatCompactPrice(typedOffer)}
                    </span>
                  )}
                </div>
                {offerFeedback !== null && (
                  <p
                    aria-live="polite"
                    className={`mt-2 text-xs ${offerPct !== null && offerPct < 50 ? 'font-medium text-amber-700' : 'text-gray-500'}`}
                  >
                    <span className="font-medium">{offerFeedback}</span>
                    {offerDelta !== 0 && (
                      <>
                        {' '}· {formatCompactPrice(Math.abs(offerDelta))}{' '}
                        {offerDelta > 0 ? 'above' : 'below'} her rate
                      </>
                    )}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500 text-center mb-5">
                Her rates are fixed and not open to offers.
                {selectedOption?.priceNgn != null && (
                  <> For this, her rate is {formatPrice(selectedOption.priceNgn)}.</>
                )}
              </p>
            )}

            {intakeQuestions.length > 0 && (
              <div className="mb-5 rounded-2xl bg-cream p-4 ring-1 ring-black/[0.04]">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-400">
                  {activeName} asks
                </p>
                <div className="mt-3 space-y-3">
                  {intakeQuestions.map((q, i) => (
                    <div key={i}>
                      <label htmlFor={`intake-${i}`} className="text-sm font-medium text-charcoal">
                        {q}
                      </label>
                      <textarea
                        id={`intake-${i}`}
                        value={intakeAnswers[i] ?? ''}
                        onChange={(e) =>
                          setIntakeAnswers((prev) => {
                            const next = [...prev]
                            next[i] = e.target.value
                            return next
                          })
                        }
                        rows={2}
                        maxLength={300}
                        required
                        placeholder="Your answer"
                        className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 text-base text-charcoal outline-none focus:border-primary transition-colors md:text-sm"
                      />
                      <p className="mt-1 text-right text-[11px] text-gray-400">
                        {(intakeAnswers[i] ?? '').length}/300
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  Keep answers inside Intima. No phone numbers or social handles.
                </p>
              </div>
            )}

            {eligibility && eligibility.checks.length > 0 && (
              <div className="mb-5 rounded-2xl bg-cream p-4 ring-1 ring-black/[0.04]">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-400">Her requirements</p>
                <div className="mt-2 space-y-1.5">
                  {eligibility.checks.map((c) => (
                    <p key={c.key} className="flex items-center gap-2 text-sm">
                      {c.ok
                        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                      <span className="font-medium text-charcoal">{c.label}</span>
                      <span className="text-xs text-neutral-400">({c.have})</span>
                    </p>
                  ))}
                </div>
                {!eligibility.eligible && (
                  <p className="mt-2.5 text-xs leading-relaxed text-neutral-500">
                    You cannot pay yet. Meet the items above first, then come back.
                    {eligibility.checks.some((c) => c.key === 'verified' && !c.ok) && (
                      <> <a href="/verification" className="font-semibold text-primary">Get verified</a></>
                    )}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={cardEnabled ? () => handleCardPay() : handlePay}
              disabled={fee === null || !profileLoaded || (eligibility !== null && !eligibility.eligible) || !intakeComplete}
              className="w-full bg-primary hover:bg-primary-dark text-white font-medium py-3.5 rounded-2xl transition-colors disabled:opacity-50"
            >
              {fee === null
                ? 'Loading fee...'
                : !profileLoaded
                  ? 'Loading her questions...'
                  : eligibility && !eligibility.eligible
                    ? 'Requirements not met yet'
                    : !intakeComplete
                      ? 'Answer her questions first'
                      : cardEnabled
                        ? `Pay ${formatPrice(fee)} with card`
                        : `Pay ${formatPrice(fee)} (Test mode)`}
            </button>
            {transferEnabled && (
              <>
                <button
                  onClick={() => handleCardPay('bank_transfer')}
                  disabled={fee === null || !profileLoaded || (eligibility !== null && !eligibility.eligible) || !intakeComplete}
                  className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-2xl border-2 border-charcoal/80 py-3 text-sm font-semibold text-charcoal transition-all hover:bg-charcoal hover:text-white disabled:opacity-40"
                >
                  {fee === null ? 'Pay with bank transfer' : `Pay ${formatPrice(fee)} with bank transfer`}
                </button>
                <p className="mt-2 text-center text-xs leading-relaxed text-gray-500">
                  Paystack creates an account number for this payment only. Transfer the exact
                  amount from any bank app and your connection opens automatically once it
                  confirms. You can close the page after transferring.
                </p>
              </>
            )}
            <button
              onClick={handleCryptoPay}
              disabled={!profileLoaded || (eligibility !== null && !eligibility.eligible) || !intakeComplete}
              className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-2xl border-2 border-charcoal/80 py-3 text-sm font-semibold text-charcoal transition-all hover:bg-charcoal hover:text-white disabled:opacity-40"
            >
              Or pay with crypto (USDT)
            </button>
            <p className="mt-2 text-center text-xs leading-relaxed text-gray-500">
              A secure invoice opens in a new tab. Pay there, and your connection opens here
              once the payment confirms.
            </p>
            <p className="text-xs text-gray-400 text-center mt-3">
              One active connection per provider. Refunds follow the published policy.
            </p>
          </>
        )}

        {step === 'processing' && (
          <div className="py-10 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-gray-600">Processing your connection (test mode)...</p>
          </div>
        )}

        {step === 'success' && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="w-14 h-14 text-green-600" />
            <h3 className="text-lg font-bold text-charcoal">You are connected</h3>
            <p className="text-sm text-gray-600 max-w-xs">
              You can now chat and call {activeName} directly from her profile. No middleman, no extra cuts.
            </p>
            <div className="flex gap-2 w-full mt-2">
              <button
                onClick={onClose}
                className="flex-1 bg-primary hover:bg-primary-dark text-white font-medium py-3 min-h-[48px] rounded-2xl transition-colors flex items-center justify-center gap-2"
              >
                <Video className="w-4 h-4" />
                Start a call
              </button>
            </div>
          </div>
        )}

        {step === 'unavailable' && (
          <div className="py-6 flex flex-col gap-4">
            <div className="text-center">
              <h3 className="text-lg font-bold text-charcoal">{activeName} is not available right now</h3>
              <p className="text-sm text-gray-600 mt-1">
                Your payment is safe. Pick an available companion below and your connection switches to her instantly.
              </p>
            </div>
            {similar.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No similar companions are online at the moment. Try again later.
              </p>
            ) : (
              <div className="space-y-3">
                {similar.map((sp) => (
                  <button
                    key={sp.providerId}
                    onClick={() => onPickSimilar(sp)}
                    className="w-full flex items-center gap-3 rounded-2xl border border-gray-200 p-3 hover:border-primary/50 hover:bg-cream/50 transition-colors text-left"
                  >
                    {sp.avatar ? (
                      <img src={sp.avatar} alt={sp.name} className="w-14 h-14 rounded-xl object-cover" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-primary-muted flex items-center justify-center text-primary font-bold">
                        {getInitials(sp.name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-charcoal truncate">{sp.name}</p>
                      <p className="text-xs text-gray-500">
                        {sp.city}{sp.rateShortTime ? ` · ${formatPrice(sp.rateShortTime)}` : ''}
                      </p>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                        Available now
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full border border-gray-300 text-gray-600 font-medium py-3 rounded-2xl hover:bg-gray-50 transition-colors"
            >
              Not now
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500" />
            <h3 className="text-lg font-bold text-charcoal">Payment did not go through</h3>
            <p className="text-sm text-gray-600">{error}</p>
            <div className="flex gap-3 w-full mt-2">
              <button
                onClick={() => setStep('summary')}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-3 rounded-2xl hover:bg-gray-50 transition-colors"
              >
                Try again
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-gray-100 text-gray-600 font-medium py-3 rounded-2xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
