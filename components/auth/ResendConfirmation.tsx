'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { friendlyAuthError } from '@/lib/auth/errors'
import { CheckCircle, Mail } from '@/lib/icons'

/**
 * The recovery path for a dead confirmation link.
 *
 * Confirmation links expire. Before this component existed, a user
 * whose link had died hit a wall at sign-in: the error told them to
 * open the link in their inbox, and the link did nothing. The only
 * way in was a password reset, which confirms the email as a side
 * effect. Owner hit exactly that (2026-10-25) and ordered the fix:
 * when sign-in says the email is unconfirmed, offer a fresh link
 * right there.
 *
 * Sends through Supabase auth.resend (type 'signup'), which mails a
 * NEW confirmation link via the project's SMTP (Brevo). Two layers
 * of pacing keep impatient taps from making things worse: GoTrue
 * enforces its own per-address email cooldown (429
 * over_email_send_rate_limit, "you can only request this after N
 * seconds"), which this component reads and turns into a live
 * countdown instead of an error; and a 60 second cooldown after
 * every successful send.
 */
export default function ResendConfirmation({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const resend = async () => {
    setState('sending')
    setError(null)
    setNotice(null)
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
    })
    if (resendError) {
      const raw = resendError.message ?? ''
      const waitMatch = raw.match(/after (\d+) seconds?/i)
      if (waitMatch || raw.toLowerCase().includes('rate limit')) {
        // GoTrue's own cooldown: an email went out moments ago.
        // That is not a failure, it is a queue. Count it down.
        const wait = waitMatch ? parseInt(waitMatch[1], 10) : 60
        setCooldown(wait + 2)
        setState('idle')
        setNotice(
          'A confirmation email was already sent a moment ago. Check your inbox first, and your spam folder if it is not there.',
        )
        return
      }
      setState('error')
      setError(
        friendlyAuthError(
          resendError,
          'We could not send a new confirmation email. Please try again.',
        ),
      )
      return
    }
    setState('sent')
    setCooldown(60)
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-left">
      <p className="flex items-center gap-2 text-sm font-semibold text-charcoal">
        <Mail aria-hidden className="h-4 w-4 shrink-0 text-[#AC244D]" />
        Your email is not confirmed yet
      </p>
      <p className="mt-1 text-sm leading-relaxed text-neutral-600">
        Confirmation links expire after a while, so the one in your inbox may
        no longer work. Send a fresh link, open it, then sign in.
      </p>
      {state === 'sent' && (
        <p className="mt-2.5 flex items-start gap-2 text-sm font-medium text-emerald-700">
          <CheckCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            New confirmation email sent to {email}. Check your inbox, and your
            spam folder if it is not there.
          </span>
        </p>
      )}
      {notice && (
        <p className="mt-2.5 text-sm font-medium text-amber-800">{notice}</p>
      )}
      <button
        type="button"
        onClick={resend}
        disabled={state === 'sending' || cooldown > 0}
        className="mt-2.5 inline-flex min-h-[40px] items-center rounded-full bg-[#AC244D] px-4 text-sm font-semibold text-white transition-all hover:bg-[#8F1D40] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === 'sending'
          ? 'Sending...'
          : cooldown > 0
            ? `Send again in ${cooldown}s`
            : state === 'sent'
              ? 'Send another confirmation email'
              : 'Send a new confirmation email'}
      </button>
      {state === 'error' && error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
