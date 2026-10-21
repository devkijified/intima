// Server-only transactional email for Intima, via the Brevo API.
// Never import this module from client components.
//
// Design rule: email is a second channel on the notifyUsers primitive,
// not a parallel system. notifyUsers calls sendEventEmails with the
// same payload it used for the in-app row and the push; only types in
// EMAIL_TYPES produce mail. Everything here is best effort: a missing
// key, a Brevo outage, or a bad address must never fail the request
// that triggered the notification, so nothing in this file throws.

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { siteOrigin } from '../links'
import { buildEventEmail } from './templates'

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const DEFAULT_FROM = 'intima0069@gmail.com'
// Fanout guard: one notifyUsers call emails at most this many people.
// Real fanouts (live_started, contest publishes) are not in
// EMAIL_TYPES, so this only ever bounds admin or bulk mistakes.
const MAX_EMAILS_PER_CALL = 50

/**
 * Notification types that also go out by email, because they carry
 * money, account standing, or a decision the user asked for.
 *
 * In use today: new_connection, dispute_opened, dispute_resolved.
 * The remaining names are the canonical types for flows that do not
 * call notifyUsers yet (cashouts, verification decisions, contest
 * payouts, referral rewards, subscription lifecycle): they are armed
 * here so wiring those call sites later needs no mailer change.
 *
 * Deliberately absent: live_started, booking_message, incoming_call,
 * provider_hidden, and the shared 'system' type. 'system' carries both
 * transactional subscription events (fan club started, renewed,
 * lapsed, paused) and live chatter (PK results, co-host invites) that
 * must never be emailed, so it stays push-only until those call sites
 * get distinct types.
 */
export const EMAIL_TYPES = new Set<string>([
  // Connections
  'new_connection',
  'connection_accepted',
  'connection_deFlintd',
  'connection_expired',
  // Disputes (opened also covers evidence-added notices)
  'dispute_opened',
  'dispute_resolved',
  // Cashouts
  'cashout_requested',
  'cashout_approved',
  'cashout_rejected',
  'cashout_paid',
  // Subscriptions
  'subscription_started',
  'subscription_renewed',
  'subscription_lapsed',
  'subscription_paused',
  // Verification decisions
  'verification_approved',
  'verification_rejected',
  // Contests and referrals
  'contest_won',
  'referral_reward',
])

function serviceDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// Best-effort mirror of the error_logs insert in app/api/logs: same
// columns, wrapped so logging itself can never break a send.
async function logMailError(message: string, detail?: string): Promise<void> {
  try {
    await serviceDb()
      .from('error_logs')
      .insert({
        message: message.slice(0, 500),
        route: 'lib/mail/mailer',
        source: 'server',
        stack_head: detail ? detail.slice(0, 2000) : null,
      })
  } catch {
    // Logging is best effort only.
  }
}

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
}

export interface SendEmailResult {
  skipped: boolean
  ok: boolean
  /** Brevo HTTP status when a request was made, else null. */
  status: number | null
}

/**
 * Send one email through Brevo. No-ops silently when BREVO_API_KEY is
 * not set. Never throws.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) return { skipped: true, ok: false, status: null }
  const from = process.env.MAIL_FROM || DEFAULT_FROM
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Intima', email: from },
        to: [{ email: input.to }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`[mail] Brevo send failed (${res.status}) for ${input.to}: ${detail}`)
      await logMailError(`Brevo send failed with status ${res.status}`, detail)
      return { skipped: false, ok: false, status: res.status }
    }
    return { skipped: false, ok: true, status: res.status }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[mail] Brevo send threw for ${input.to}: ${detail}`)
    await logMailError('Brevo send threw', detail)
    return { skipped: false, ok: false, status: null }
  }
}

export interface EventEmailOpts {
  userIds: string[]
  type: string
  title: string
  body?: string
  link?: string
}

/**
 * The email pass of notifyUsers: for allowlisted types, resolve each
 * recipient's account email and send the branded event template. One
 * email per user per call, capped, failures isolated per recipient.
 * Never throws.
 */
export async function sendEventEmails(opts: EventEmailOpts): Promise<void> {
  try {
    if (!EMAIL_TYPES.has(opts.type)) return
    if (!process.env.BREVO_API_KEY) return
    const uniqueIds = [...new Set(opts.userIds)].slice(0, MAX_EMAILS_PER_CALL)
    if (uniqueIds.length === 0) return

    const content = buildEventEmail({
      title: opts.title,
      body: opts.body,
      link: opts.link,
      appUrl: siteOrigin(),
    })
    const db = serviceDb()

    await Promise.all(
      uniqueIds.map(async (userId) => {
        try {
          const { data } = await db.auth.admin.getUserById(userId)
          const email = data?.user?.email
          if (!email) return
          await sendEmail({
            to: email,
            subject: opts.title,
            html: content.html,
            text: content.text,
          })
        } catch {
          // One bad recipient must not stop the rest.
        }
      })
    )
  } catch {
    // Email is a second channel; the in-app row and push already landed.
  }
}
