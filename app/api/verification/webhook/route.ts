import { NextRequest, NextResponse } from 'next/server'
import { createHash, createHmac, timingSafeEqual } from 'crypto'
import {
  applyVerificationDecision,
  createVerificationServiceDb,
  sanitizeProviderResult,
  type VerificationRowForAutomation,
} from '@/lib/verification/automation'

export const dynamic = 'force-dynamic'

// Dojah webhook receiver. The primary integration is the synchronous
// dispatch (see app/api/verification/dispatch), which needs no
// webhook at all. This route exists for Dojah's hosted flows (widget
// and EasyOnboard), whose results arrive as events. Signature rules
// per Dojah's webhook docs:
//   x-dojah-signature     = HMAC SHA256 of the raw JSON body, keyed
//                           with the webhook secret from the Dojah
//                           dashboard (Developers, Webhooks).
//   x-dojah-signature-v2  = SHA256 of the API secret key alone.
// Requests that carry neither a verifiable signature nor a configured
// secret are rejected. Events are matched to a submission through
// metadata.intima_verification_id, a provider_reference equal to the
// event reference_id, or the reference_id itself when it is one of
// our row ids. Unmatched events are acknowledged and ignored.

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

function signatureOk(rawBody: string, req: NextRequest): boolean {
  const sig = req.headers.get('x-dojah-signature')
  const sigV2 = req.headers.get('x-dojah-signature-v2')
  const webhookSecret = process.env.DOJAH_WEBHOOK_SECRET
  const secretKey = process.env.DOJAH_SECRET_KEY
  if (sig && webhookSecret) {
    const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
    return safeEqual(sig, expected)
  }
  if (sigV2 && secretKey) {
    const expected = createHash('sha256').update(secretKey).digest('hex')
    return safeEqual(sigV2, expected)
  }
  return false
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  if (!signatureOk(rawBody, req)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = asRecord(JSON.parse(rawBody || '{}'))
  const metadata = asRecord(payload.metadata)
  const referenceId = typeof payload.reference_id === 'string' ? payload.reference_id : null
  const candidateId =
    (typeof metadata.intima_verification_id === 'string' && metadata.intima_verification_id) ||
    (typeof metadata.verification_id === 'string' && metadata.verification_id) ||
    (referenceId && UUID_RE.test(referenceId) ? referenceId : null)

  const db = createVerificationServiceDb()
  const selectCols =
    'id, provider_id, status, id_document_url, selfie_url, sign_selfie_url, id_type'

  let row: VerificationRowForAutomation | null = null
  if (candidateId) {
    const { data } = await db.from('verifications').select(selectCols).eq('id', candidateId).limit(1)
    row = (data?.[0] ?? null) as VerificationRowForAutomation | null
  }
  if (!row && referenceId) {
    const { data } = await db
      .from('verifications')
      .select(selectCols)
      .eq('provider_reference', referenceId)
      .limit(1)
    row = (data?.[0] ?? null) as VerificationRowForAutomation | null
  }
  if (!row) {
    return NextResponse.json({ ok: true, ignored: true })
  }
  if (row.status !== 'pending') {
    return NextResponse.json({ ok: true, alreadyDecided: true })
  }

  // Dojah warns that a Completed event means the flow finished, not
  // that the person passed: the top-level status and each step's own
  // status carry the verdict.
  const verificationStatus =
    typeof payload.verification_status === 'string' ? payload.verification_status : ''
  const data = asRecord(payload.data)
  const idStep = asRecord(data.id)
  const selfieStep = asRecord(data.selfie)
  const topLevelPassed = payload.status === true
  const stepsPassed = idStep.status !== false && selfieStep.status !== false

  if (verificationStatus === 'Completed' && topLevelPassed && stepsPassed) {
    await applyVerificationDecision(db, {
      row,
      approve: true,
      notes: 'Approved automatically by Dojah: the hosted verification flow completed and every step passed.',
      automationStatus: 'approved',
      provider: 'dojah',
      providerResult: payload,
      providerConfidence: null,
      decisionSource: 'dojah_webhook',
    })
    return NextResponse.json({ ok: true, decided: 'approved' })
  }

  if (verificationStatus === 'Failed') {
    await applyVerificationDecision(db, {
      row,
      approve: false,
      notes:
        'The automated verification could not be completed. Please check the photo guidance on the verification page and submit again.',
      automationStatus: 'rejected',
      provider: 'dojah',
      providerResult: payload,
      providerConfidence: null,
      decisionSource: 'dojah_webhook',
    })
    return NextResponse.json({ ok: true, decided: 'rejected' })
  }

  // Ongoing, Pending, Abandoned, or a Completed event whose steps did
  // not all pass: nothing is decided here. The submission stays in
  // the admin queue with the event stored for the reviewer.
  await db
    .from('verifications')
    .update({
      automation_status: 'manual_review',
      provider: 'dojah',
      provider_result: sanitizeProviderResult(payload),
      decision_source: 'dojah_webhook',
      automated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('status', 'pending')
  return NextResponse.json({ ok: true, decided: null })
}
