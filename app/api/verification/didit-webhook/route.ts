import { NextRequest, NextResponse } from 'next/server'
import {
  createVerificationServiceDb,
  type VerificationRowForAutomation,
} from '@/lib/verification/automation'
import {
  applyDiditOutcome,
  fetchDiditDecision,
  verifyDiditSignature,
} from '@/lib/verification/didit'

export const dynamic = 'force-dynamic'

// Didit webhook receiver. Didit posts session status events here;
// every delivery carries an X-Signature-V2 HMAC header keyed with
// the destination's shared secret (see lib/verification/didit.ts).
// Unsigned or badly signed deliveries are rejected. Events are
// matched to a submission by the session id stored in
// provider_reference, or by vendor_data, which session creation set
// to our verifications row id. A verdict from a superseded session
// (the row has since started a newer one) is ignored.

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  if (!verifyDiditSignature(rawBody, req.headers.get('x-signature-v2'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = asRecord(JSON.parse(rawBody || '{}'))
  const nested = asRecord(payload.data)
  const root =
    typeof nested.session_id === 'string' || typeof nested.status === 'string' ? nested : payload

  const sessionId = typeof root.session_id === 'string' ? root.session_id : null
  const vendorData = typeof root.vendor_data === 'string' ? root.vendor_data : null
  const status = typeof root.status === 'string' ? root.status : ''
  if (!status) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const db = createVerificationServiceDb()
  const selectCols =
    'id, provider_id, status, id_document_url, selfie_url, sign_selfie_url, id_type, provider_reference'

  type RowWithRef = VerificationRowForAutomation & { provider_reference?: string | null }
  async function findRow(column: 'provider_reference' | 'id', value: string): Promise<RowWithRef | null> {
    const { data } = await db.from('verifications').select(selectCols).eq(column, value).limit(1)
    return (data?.[0] ?? null) as RowWithRef | null
  }

  let row: RowWithRef | null = null
  if (sessionId) row = await findRow('provider_reference', sessionId)
  if (!row && vendorData && UUID_RE.test(vendorData)) row = await findRow('id', vendorData)
  if (!row) {
    return NextResponse.json({ ok: true, ignored: true })
  }
  if (row.provider_reference && sessionId && row.provider_reference !== sessionId) {
    return NextResponse.json({ ok: true, ignored: true, superseded: true })
  }
  if (row.status !== 'pending') {
    return NextResponse.json({ ok: true, alreadyDecided: true })
  }

  // Prefer the decision embedded in the event; fall back to the
  // decision endpoint when the event carries only the status.
  let decision = asRecord(root.decision)
  if (Object.keys(decision).length === 0 && sessionId) {
    decision = await fetchDiditDecision(sessionId).catch(() => ({}))
  }

  const outcome = await applyDiditOutcome(db, row, status, decision)
  return NextResponse.json({ ok: true, outcome })
}
