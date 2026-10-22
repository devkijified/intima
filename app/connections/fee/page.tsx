'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Clock, XCircle } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { formatPrice, getInitials } from '@/lib/utils/helpers'
import { HelpTip } from '@/components/ui/Tooltip'

/**
 * The held-fee page (pay-first, migration 078).
 *
 * A client lands here from the fee-held notification or the
 * payment callback after paying for a companion who turned out
 * to be unavailable. The fee he already paid is a credit toward
 * a connection, never a route around the fee: from here he can
 * apply it once to an available companion (her screening
 * questions and requirements bind as usual), apply it to the
 * original companion if she is back, or take the refund_pct
 * refund through the rail he paid on. Nothing here opens a chat
 * by itself; applying is the only way through, and it creates a
 * normal connection.
 */

interface ProviderBrief {
  id: string
  name: string
  avatar: string | null
  username: string | null
  city: string | null
  availableNow?: boolean
  rateShortTime?: number | null
}

interface FeeState {
  state: string
  reference: string
  amountNgn?: number
  refundPct?: number
  refundAmountNgn?: number
  expiresAt?: string | null
  target?: (ProviderBrief & { availableNow: boolean }) | null
  appliedProvider?: ProviderBrief | null
  similar?: Array<{
    providerId: string
    username: string | null
    name: string
    avatar: string | null
    city: string | null
    rateShortTime: number | null
  }>
}

function Avatar({ brief, size = 'h-14 w-14' }: { brief: ProviderBrief; size?: string }) {
  return brief.avatar ? (
    <img src={brief.avatar} alt={brief.name} className={`${size} rounded-xl object-cover`} />
  ) : (
    <div className={`${size} flex items-center justify-center rounded-xl bg-primary-muted font-bold text-primary`}>
      {getInitials(brief.name)}
    </div>
  )
}

function ApplyPanel({
  reference,
  provider,
  onApplied,
}: {
  reference: string
  provider: ProviderBrief
  onApplied: (provider: ProviderBrief) => void
}) {
  const [questions, setQuestions] = useState<string[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [offer, setOffer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false
    supabase
      .from('profiles')
      .select('intake_questions')
      .eq('id', provider.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const raw = (data as { intake_questions?: unknown } | null)?.intake_questions
        const qs = Array.isArray(raw)
          ? raw.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, 3)
          : []
        setQuestions(qs)
        setAnswers(qs.map(() => ''))
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id])

  const answersComplete =
    questions.length === 0 || questions.every((_, i) => (answers[i] ?? '').trim().length > 0)
  const offerNgn = parseInt(offer.replace(/[^0-9]/g, ''), 10)

  async function apply() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/connections/apply-fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_ref: reference,
          provider_id: provider.id,
          proposed_rate_ngn: Number.isFinite(offerNgn) && offerNgn > 0 ? offerNgn : undefined,
          intakeAnswers:
            questions.length > 0
              ? questions.map((q, i) => ({ q, a: (answers[i] ?? '').trim() }))
              : undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error ?? 'Could not apply your fee. Please try again.')
      }
      onApplied(provider)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 rounded-2xl bg-cream p-4">
      {questions.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-400">
            {provider.name} asks
          </p>
          {questions.map((q, i) => (
            <div key={i}>
              <label htmlFor={`fee-intake-${i}`} className="text-sm font-medium text-charcoal">
                {q}
              </label>
              <textarea
                id={`fee-intake-${i}`}
                value={answers[i] ?? ''}
                onChange={(e) =>
                  setAnswers((prev) => {
                    const next = [...prev]
                    next[i] = e.target.value
                    return next
                  })
                }
                rows={2}
                maxLength={300}
                placeholder="Your answer"
                className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 text-base text-charcoal outline-none transition-colors focus:border-primary md:text-sm"
              />
            </div>
          ))}
          <p className="text-xs text-gray-500">
            Keep answers inside Intima. No phone numbers or social handles.
          </p>
        </div>
      )}
      <div className={questions.length > 0 ? 'mt-3' : ''}>
        <label htmlFor="fee-offer" className="text-sm font-medium text-charcoal">
          Propose your rate <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <div className="relative mt-1.5">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-medium text-gray-500">₦</span>
          <input
            id="fee-offer"
            type="text"
            inputMode="numeric"
            value={offer}
            onChange={(e) => setOffer(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Leave blank to accept her rate"
            className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-9 pr-3.5 text-base text-charcoal outline-none transition-colors focus:border-primary md:text-sm"
          />
        </div>
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={apply}
        disabled={busy || !answersComplete}
        className="btn-luxe mt-4 inline-flex min-h-[48px] w-full items-center justify-center px-6 py-3 text-sm disabled:opacity-50"
      >
        {busy ? 'Applying your fee...' : !answersComplete ? 'Answer her questions first' : `Apply my fee to ${provider.name}`}
      </button>
    </div>
  )
}

function HeldFeeInner() {
  const params = useSearchParams()
  const reference = params.get('ref')

  const [fee, setFee] = useState<FeeState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [applyTarget, setApplyTarget] = useState<ProviderBrief | null>(null)
  const [appliedTo, setAppliedTo] = useState<ProviderBrief | null>(null)
  const [refundBusy, setRefundBusy] = useState(false)
  const [refundError, setRefundError] = useState('')

  useEffect(() => {
    if (!reference) {
      setLoadError('This link is missing its payment reference. Open it from your notifications instead, or contact support.')
      return
    }
    let live = true
    fetch(`/api/connections/fee?ref=${encodeURIComponent(reference)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!live) return
        if (r.status === 401) {
          setLoadError('Please sign in with the account that paid the fee, then open this link again.')
          return
        }
        if (!r.ok || !data) {
          setLoadError(data?.error ?? 'We could not load this fee. Please try again.')
          return
        }
        setFee(data as FeeState)
      })
      .catch(() => {
        if (live) setLoadError('We could not load this fee. Check your connection and try again.')
      })
    return () => {
      live = false
    }
  }, [reference])

  async function takeRefund() {
    if (!reference) return
    setRefundBusy(true)
    setRefundError('')
    try {
      const res = await fetch('/api/connections/fee-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_ref: reference }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error ?? 'The refund did not go through. Please try again.')
      }
      setFee((prev) =>
        prev
          ? {
              ...prev,
              state: data.state === 'refunded' ? 'refunded' : 'refund_pending',
              refundAmountNgn: data.refundAmountNgn ?? prev.refundAmountNgn,
              refundPct: data.pct ?? prev.refundPct,
            }
          : prev
      )
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : 'The refund did not go through. Please try again.')
    } finally {
      setRefundBusy(false)
    }
  }

  if (loadError) {
    return (
      <Shell>
        <XCircle className="h-12 w-12 text-red-400" />
        <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">We could not load this fee</h1>
        <p className="mt-1 text-sm leading-relaxed text-neutral-500">{loadError}</p>
        <Link href="/notifications" className="btn-luxe mt-6 inline-flex min-h-[44px] items-center justify-center px-6 py-3 text-sm">Open my notifications</Link>
        <Link href="/tickets" className="mt-3 text-sm font-medium text-primary">Contact support</Link>
      </Shell>
    )
  }

  if (!fee) {
    return (
      <Shell>
        <Clock className="h-12 w-12 animate-pulse text-primary" />
        <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">Loading your fee</h1>
        <p className="mt-1 text-sm text-neutral-500">One moment while we check its state.</p>
      </Shell>
    )
  }

  if (appliedTo || fee.state === 'applied') {
    const who = appliedTo ?? fee.appliedProvider ?? fee.target
    return (
      <Shell>
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">You are connected</h1>
        <p className="mt-1 text-sm leading-relaxed text-neutral-500">
          {who
            ? `Your fee opened your connection with ${who.name}. Say hello in Messages.`
            : 'Your fee opened your connection. Say hello in Messages.'}
        </p>
        <Link href="/messages" className="btn-luxe mt-6 inline-flex min-h-[44px] items-center justify-center px-6 py-3 text-sm">Open Messages</Link>
        {who && (
          <Link href={`/companion/${who.username ?? who.id}`} className="mt-3 text-sm font-medium text-primary">
            View her profile
          </Link>
        )}
      </Shell>
    )
  }

  if (fee.state === 'refunded' || fee.state === 'refund_pending' || fee.state === 'refund_failed') {
    const failed = fee.state === 'refund_failed'
    return (
      <Shell>
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">
          {failed ? 'Your refund needs another try' : fee.state === 'refunded' ? 'Your refund is on its way' : 'Your refund is being processed'}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-neutral-500">
          {failed
            ? 'The refund did not complete at the payment provider. Your fee is still held and safe.'
            : `${fee.refundAmountNgn !== undefined ? formatPrice(fee.refundAmountNgn) : 'Your refund'} (${fee.refundPct ?? 85}% of the fee) goes back through the way you paid.`}
        </p>
        {failed && (
          <button
            type="button"
            onClick={takeRefund}
            disabled={refundBusy}
            className="btn-luxe mt-6 inline-flex min-h-[44px] items-center justify-center px-6 py-3 text-sm disabled:opacity-50"
          >
            {refundBusy ? 'Trying again...' : 'Try the refund again'}
          </button>
        )}
        {refundError && (
          <p className="mt-3 text-sm text-red-500" role="alert">{refundError}</p>
        )}
        <Link href="/" className="mt-3 text-sm font-medium text-primary">Back to the map</Link>
      </Shell>
    )
  }

  // state === 'held'
  const target = fee.target ?? null
  const expiresLabel = fee.expiresAt
    ? new Date(fee.expiresAt).toLocaleDateString('en-NG', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : null
  const similar: ProviderBrief[] = (fee.similar ?? []).map((sp) => ({
    id: sp.providerId,
    name: sp.name,
    avatar: sp.avatar,
    username: sp.username,
    city: sp.city,
    rateShortTime: sp.rateShortTime,
  }))

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="font-display text-2xl font-semibold text-charcoal">Your connection fee is held</h1>
      <p className="mt-1 text-sm leading-relaxed text-neutral-500">
        {target
          ? `You paid ${fee.amountNgn !== undefined ? formatPrice(fee.amountNgn) : 'the fee'} to connect with ${target.name}, and she is not available right now, so no connection was opened.`
          : 'You paid this fee, and the companion is not available right now, so no connection was opened.'}{' '}
        The fee is yours to direct: apply it below, or take a refund.
      </p>

      {target && (
        <div className="mt-6 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center gap-3">
            <Avatar brief={target} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-charcoal">{target.name}</p>
              <p className="text-xs text-gray-500">{target.city ?? 'Your original pick'}</p>
              {target.availableNow ? (
                <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-green-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                  Available now
                </span>
              ) : (
                <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-gray-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                  Not available right now
                </span>
              )}
            </div>
          </div>
          {target.availableNow && applyTarget?.id !== target.id && (
            <button
              type="button"
              onClick={() => setApplyTarget(target)}
              className="btn-luxe mt-4 inline-flex min-h-[48px] w-full items-center justify-center px-6 py-3 text-sm"
            >
              Connect with {target.name} now
            </button>
          )}
          {applyTarget?.id === target.id && (
            <ApplyPanel reference={fee.reference} provider={target} onApplied={setAppliedTo} />
          )}
        </div>
      )}

      {similar.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-charcoal">Available now, similar to your pick</h2>
          <div className="mt-3 space-y-3">
            {similar.map((sp) => (
              <div key={sp.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="flex items-center gap-3">
                  <Avatar brief={sp} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-charcoal">{sp.name}</p>
                    <p className="text-xs text-gray-500">
                      {sp.city}
                      {sp.rateShortTime ? ` · ${formatPrice(sp.rateShortTime)}` : ''}
                    </p>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-green-700">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                      Available now
                    </span>
                  </div>
                  {applyTarget?.id !== sp.id && (
                    <button
                      type="button"
                      onClick={() => setApplyTarget(sp)}
                      className="shrink-0 rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                    >
                      Apply fee
                    </button>
                  )}
                </div>
                {applyTarget?.id === sp.id && (
                  <ApplyPanel reference={fee.reference} provider={sp} onApplied={setAppliedTo} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-3xl bg-cream p-4 ring-1 ring-black/[0.04]">
        <p className="flex items-center gap-1 text-sm font-semibold text-charcoal">
          Rather take the money back?
          <HelpTip text={`A held fee refunds at ${fee.refundPct ?? 85}%, the published refund policy: the platform keeps the rest as a processing share. The refund goes back through the way you paid.`} />
        </p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          You get {fee.refundAmountNgn !== undefined ? formatPrice(fee.refundAmountNgn) : 'most of the fee'} of your{' '}
          {fee.amountNgn !== undefined ? formatPrice(fee.amountNgn) : 'fee'} back.
          {expiresLabel
            ? ` If you do nothing, the hold ends on ${expiresLabel} and the same refund is sent automatically.`
            : ''}
        </p>
        <button
          type="button"
          onClick={takeRefund}
          disabled={refundBusy}
          className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          {refundBusy
            ? 'Sending your refund...'
            : `Refund ${fee.refundAmountNgn !== undefined ? formatPrice(fee.refundAmountNgn) : 'me'}`}
        </button>
        {refundError && (
          <p className="mt-2 text-xs text-red-500" role="alert">
            {refundError}
          </p>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        Reference {fee.reference}. Your fee can only ever open one connection.
      </p>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      {children}
    </div>
  )
}

export default function HeldFeePage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <Clock className="h-12 w-12 animate-pulse text-primary" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">Loading your fee</h1>
        </Shell>
      }
    >
      <HeldFeeInner />
    </Suspense>
  )
}
