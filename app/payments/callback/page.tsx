'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, XCircle } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { IntimaLoader } from '@/components/shared/IntimaLoader'

/**
 * Paystack return page for the connection fee.
 *
 * State machine, in order:
 *   working      verifying the payment with our verify endpoint.
 *   notCompleted the payment itself did not confirm; only this
 *                state may say "Payment not completed".
 *   questions    the payment IS confirmed, but the companion's
 *                screening answers never reached the server (they
 *                used to ride in sessionStorage and could be lost
 *                across the redirect). Her questions render here
 *                and Continue re-posts with the same reference, so
 *                a paid payment is never stranded by missing answers.
 *   paidFailed   the payment IS confirmed, but the connection could
 *                not be opened for another reason; the copy says so
 *                and gives the reference for support.
 *   done         connected (including alreadyConnected).
 */

type State = 'working' | 'waiting' | 'done' | 'notCompleted' | 'questions' | 'paidFailed' | 'boardLive'

/** Paystack statuses that mean "money still in flight" (bank transfers). */
const PENDING_STATUSES = ['pending', 'processing', 'ongoing', 'queued']

const SCREENING_ERROR = 'Please answer her screening questions first'

export default function PaymentsCallbackPage() {
  const params = useSearchParams()
  const router = useRouter()
  const reference = params.get('ref') ?? params.get('reference')

  const [state, setState] = useState<State>('working')
  const [message, setMessage] = useState('Confirming your payment…')
  const [providerId, setProviderId] = useState<string | null>(null)
  const [providerName, setProviderName] = useState<string | null>(null)
  const [questions, setQuestions] = useState<string[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const serviceTypeRef = useRef<string | null>(null)

  /** Success path shared by the first post and the questions form. */
  async function finishConnected(targetId: string) {
    // The stash is cleared only now, after the connection exists.
    try {
      sessionStorage.removeItem(`intima_intake_${targetId}`)
      sessionStorage.removeItem(`intima_service_${targetId}`)
    } catch { /* storage unavailable */ }
    const supabase = createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', targetId)
      .maybeSingle()
    setState('done')
    setMessage('You are connected. Say hello when you are ready.')
    const slug = profile?.username ?? targetId
    setTimeout(() => router.push(`/companion/${slug}`), 1200)
  }

  /** One POST /api/connections attempt; returns the raw outcome. */
  async function postConnection(
    targetId: string,
    intakeAnswers: unknown,
    serviceType: string | null
  ): Promise<{ ok: boolean; alreadyConnected: boolean; error: string | null }> {
    const res = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider_id: targetId,
        payment_ref: reference,
        ...(intakeAnswers ? { intakeAnswers } : {}),
        ...(serviceType ? { service_type: serviceType } : {}),
      }),
    })
    const data = await res.json().catch(() => null)
    return {
      ok: res.ok,
      alreadyConnected: data?.alreadyConnected === true,
      error: typeof data?.error === 'string' ? data.error : null,
    }
  }

  useEffect(() => {
    if (!reference) {
      setState('notCompleted')
      setMessage('No payment reference came back. If you were charged, contact support and we will sort it.')
      return
    }
    let live = true
    ;(async () => {
      try {
        // Bank transfers settle minutes after the payer returns, so a
        // pending status polls in a waiting state instead of failing;
        // the webhook settles the payment row even if this page is
        // closed before the transfer confirms.
        let v: {
          paid?: boolean
          status?: string
          targetProviderId?: string | null
          boardRequestId?: string | null
          intakeAnswers?: unknown
          serviceType?: string | null
        } | null = null
        for (let attempt = 0; attempt < 30; attempt++) {
          v = await fetch(`/api/payments/paystack/verify?reference=${encodeURIComponent(reference)}`)
            .then((r) => r.json())
            .catch(() => null)
          if (!live) return
          if (v?.paid) break
          if (v && typeof v.status === 'string' && PENDING_STATUSES.includes(v.status)) {
            setState('waiting')
            setMessage(
              'If you have sent the transfer, your connection opens automatically once your bank confirms it, usually a few minutes. You can close this page and reopen this link later, your payment stays safe.'
            )
            await new Promise((r) => setTimeout(r, 4000))
            continue
          }
          break
        }
        if (!live) return

        // The payment itself did not confirm: the only failure that
        // may wear the "Payment not completed" heading. A transfer
        // still in flight after polling keeps the waiting state.
        if (!v?.paid) {
          if (v && typeof v.status === 'string' && PENDING_STATUSES.includes(v.status)) {
            setState('waiting')
            setMessage(
              'This is taking longer than usual. Your connection opens automatically once your bank confirms the transfer, even if you leave this page. Reopen this link later to finish, or contact support if it takes more than a day.'
            )
            return
          }
          setState('notCompleted')
          setMessage('The payment did not confirm. You have not been connected.')
          return
        }
        // A request-board fee: settlement opened the request on
        // the board. There is no single companion to connect to.
        if (v.boardRequestId) {
          setState('boardLive')
          setMessage(
            'Your request is live on the board. Verified companions in your city can now respond, and you pick who to connect with.'
          )
          return
        }
        // Paid, but nothing to connect to: a support case, and the
        // copy must not claim the payment failed.
        if (!v.targetProviderId) {
          setState('paidFailed')
          setMessage(
            `Your payment went through, but we could not match it to a companion. Contact support with reference ${reference} and we will open your connection.`
          )
          return
        }
        const targetId = v.targetProviderId as string
        setProviderId(targetId)
        setMessage('Payment confirmed. Opening your connection…')

        // Answers, best source first: the ones stored on the payment
        // row at initialize time, then the sessionStorage stash.
        // The stash is only read here; it is cleared on success.
        let intakeAnswers: unknown =
          Array.isArray(v.intakeAnswers) && v.intakeAnswers.length > 0
            ? v.intakeAnswers
            : undefined
        let serviceType: string | null =
          typeof v.serviceType === 'string' ? v.serviceType : null
        try {
          if (!intakeAnswers) {
            const raw = sessionStorage.getItem(`intima_intake_${targetId}`)
            if (raw) intakeAnswers = JSON.parse(raw)
          }
          if (!serviceType) {
            serviceType = sessionStorage.getItem(`intima_service_${targetId}`)
          }
        } catch { /* storage unavailable */ }
        serviceTypeRef.current = serviceType

        const result = await postConnection(targetId, intakeAnswers, serviceType)
        if (!live) return
        if (result.ok || result.alreadyConnected) {
          await finishConnected(targetId)
          return
        }
        if (result.error === SCREENING_ERROR) {
          // Paid but the answers never arrived: ask them here, on
          // the spot, against the same reference.
          const supabase = createClient()
          const { data: prof } = await supabase
            .from('profiles')
            .select('intake_questions, display_name')
            .eq('id', targetId)
            .maybeSingle()
          if (!live) return
          const raw = (prof as { intake_questions?: unknown } | null)?.intake_questions
          const qs = Array.isArray(raw)
            ? raw
                .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
                .slice(0, 3)
            : []
          setQuestions(qs)
          setAnswers(qs.map(() => ''))
          setProviderName(
            (prof as { display_name?: string | null } | null)?.display_name ?? null
          )
          setState('questions')
          return
        }
        setState('paidFailed')
        setMessage(
          `${result.error ?? 'The connection could not be opened.'} Your payment is confirmed and safe. Contact support with reference ${reference} and we will open your connection.`
        )
      } catch {
        if (live) {
          setState('notCompleted')
          setMessage('Something went wrong confirming the payment. If you were charged, contact support.')
        }
      }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, router])

  const answersComplete =
    questions.length === 0 ||
    questions.every((_, i) => (answers[i] ?? '').trim().length > 0)

  /** Continue from the questions state: re-post with the same reference. */
  async function handleContinue() {
    if (!providerId || !reference || submitting) return
    setSubmitting(true)
    setFormError('')
    try {
      const intakeAnswers =
        questions.length > 0
          ? questions.map((q, i) => ({ q, a: (answers[i] ?? '').trim() }))
          : undefined
      const result = await postConnection(providerId, intakeAnswers, serviceTypeRef.current)
      if (result.ok || result.alreadyConnected) {
        await finishConnected(providerId)
        return
      }
      if (result.error === SCREENING_ERROR) {
        setFormError('Please answer every question above, then tap Continue.')
        return
      }
      setState('paidFailed')
      setMessage(
        `${result.error ?? 'The connection could not be opened.'} Your payment is confirmed and safe. Contact support with reference ${reference} and we will open your connection.`
      )
    } catch {
      setFormError('Something went wrong. Check your connection and tap Continue again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      {state === 'working' && (
        <>
          <IntimaLoader size="lg" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">One moment</h1>
          <p className="mt-1 text-sm text-neutral-500">{message}</p>
        </>
      )}
      {state === 'waiting' && (
        <>
          <IntimaLoader size="lg" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">Waiting for your transfer to confirm</h1>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500">{message}</p>
          <Link href="/" className="btn-luxe mt-6 inline-flex min-h-[44px] items-center justify-center px-6 py-3 text-sm">Back to the map</Link>
        </>
      )}
      {state === 'done' && (
        <>
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">Connected</h1>
          <p className="mt-1 text-sm text-neutral-500">{message}</p>
        </>
      )}
      {state === 'notCompleted' && (
        <>
          <XCircle className="h-12 w-12 text-red-400" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">Payment not completed</h1>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500">{message}</p>
          <Link href="/" className="btn-luxe mt-6 inline-flex min-h-[44px] items-center justify-center px-6 py-3 text-sm">Back to the map</Link>
        </>
      )}
      {state === 'paidFailed' && (
        <>
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">Payment confirmed</h1>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500">{message}</p>
          <Link href="/" className="btn-luxe mt-6 inline-flex min-h-[44px] items-center justify-center px-6 py-3 text-sm">Back to the map</Link>
        </>
      )}
      {state === 'boardLive' && (
        <>
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">Your request is live</h1>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500">{message}</p>
          <Link href="/board" className="btn-luxe mt-6 inline-flex min-h-[44px] items-center justify-center px-6 py-3 text-sm">Open the board</Link>
        </>
      )}
      {state === 'questions' && (
        <>
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">Payment confirmed</h1>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500">
            One last step. {providerName ?? 'She'} asks a few questions before
            the chat opens. Answer them here and your connection opens right away.
          </p>
          <div className="mt-6 w-full space-y-4 text-left">
            {questions.map((q, i) => (
              <div key={i}>
                <label htmlFor={`callback-intake-${i}`} className="text-sm font-medium text-charcoal">
                  {q}
                </label>
                <textarea
                  id={`callback-intake-${i}`}
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
                  className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 text-base text-charcoal outline-none focus:border-primary transition-colors md:text-sm"
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-neutral-400">
            Keep answers inside Intima. No phone numbers or social handles.
          </p>
          {formError && <p className="mt-3 text-sm text-red-500">{formError}</p>}
          <button
            type="button"
            onClick={handleContinue}
            disabled={!answersComplete || submitting}
            className="btn-luxe mt-6 inline-flex min-h-[44px] w-full items-center justify-center px-6 py-3 text-sm disabled:opacity-50"
          >
            {submitting ? 'Opening your connection…' : 'Continue'}
          </button>
        </>
      )}
    </div>
  )
}
