// Server-only Didit identity verification for Intima.
//
// Didit runs a hosted capture flow: we create a session through the
// v3 API, send the companion to the hosted URL (ID capture, passive
// liveness and face match happen there), and Didit posts the verdict
// to our webhook. This module owns session creation, webhook
// signature verification and the mapping from Didit verdicts onto
// the shared decision writer in lib/verification/automation.ts.
//
// Decision policy mirrors the house rule used for every provider:
//   - Auto-approve only on Didit's own "Approved" session verdict.
//   - Auto-reject only on a clear fail: the session was Declined AND
//     both the document check and the face match were Declined,
//     which reads as a fake document or a different person rather
//     than a blurry photo.
//   - Everything else (In Review, a partial decline, expiry, an
//     abandoned session, any provider error) leaves the row pending
//     in the admin queue with the provider result stored.
//
// Env gate: with DIDIT_API_KEY / DIDIT_WORKFLOW_ID unset this module
// is a no-op and the manual upload flow is untouched. Never import
// this file from client components.
import { createHmac, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  applyVerificationDecision,
  sanitizeProviderResult,
  type VerificationRowForAutomation,
} from './automation'

const DIDIT_DEFAULT_BASE = 'https://verification.didit.me'
export const DIDIT_CALLBACK_URL = 'https://intima-snowy.vercel.app/verification'

export function diditConfigured(): boolean {
  return Boolean(process.env.DIDIT_API_KEY && process.env.DIDIT_WORKFLOW_ID)
}

function diditBaseUrl(): string {
  const raw = process.env.DIDIT_BASE_URL || DIDIT_DEFAULT_BASE
  return raw.replace(/\/+$/, '')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

async function diditFetch(path: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${diditBaseUrl()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.DIDIT_API_KEY!,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    })
    const text = await res.text().catch(() => '')
    let payload: unknown = null
    try {
      payload = text ? (JSON.parse(text) as unknown) : null
    } catch {
      payload = null
    }
    if (!res.ok) {
      throw new Error(`Didit ${path} failed (${res.status}): ${text.slice(0, 300)}`)
    }
    return payload
  } finally {
    clearTimeout(timer)
  }
}

export interface DiditSession {
  sessionId: string
  url: string
}

// Creates one hosted verification session for a verifications row.
// vendor_data carries our row id so the webhook can find the row
// even before provider_reference is stored.
export async function createDiditSession(rowId: string): Promise<DiditSession> {
  const body: Record<string, unknown> = {
    workflow_id: process.env.DIDIT_WORKFLOW_ID!,
    vendor_data: rowId,
    callback: DIDIT_CALLBACK_URL,
  }
  // Sandbox proofing only: when DIDIT_SANDBOX_SCENARIO is set (for
  // example "approve"), Didit's sandbox auto-populates the session
  // with magic inputs and a deterministic verdict. The variable is
  // never set against the live application.
  if (process.env.DIDIT_SANDBOX_SCENARIO) {
    body.sandbox_scenario = process.env.DIDIT_SANDBOX_SCENARIO
  }
  const payload = await diditFetch('/v3/session/', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const rec = asRecord(payload)
  const sessionId = typeof rec.session_id === 'string' ? rec.session_id : ''
  const url = typeof rec.url === 'string' ? rec.url : ''
  if (!sessionId || !url) throw new Error('Didit did not return a session')
  return { sessionId, url }
}

// Fetches the full decision for a session: one array per workflow
// feature (id_verifications, liveness_checks, face_matches) at the
// root of the response.
export async function fetchDiditDecision(sessionId: string): Promise<Record<string, unknown>> {
  const payload = await diditFetch(`/v3/session/${encodeURIComponent(sessionId)}/decision/`, {
    method: 'GET',
  })
  return asRecord(payload)
}

// --- Webhook signature -------------------------------------------------
// Didit signs deliveries in the X-Signature-V2 header: HMAC-SHA256
// keyed with the destination's secret_shared_key over a canonical
// form of the payload (object keys sorted recursively, float
// trailing zeros shortened, then JSON.stringify). Some Didit
// surfaces describe the signature over the raw body instead, so the
// raw-body HMAC is accepted as a fallback: both forms need the
// secret, so accepting either does not weaken the check.
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function verifyDiditSignature(rawBody: string, headerValue: string | null): boolean {
  const secret = process.env.DIDIT_WEBHOOK_SECRET
  if (!secret || !headerValue) return false
  const given = headerValue.trim().toLowerCase()
  const rawHmac = createHmac('sha256', secret).update(rawBody).digest('hex')
  if (safeEqualHex(given, rawHmac)) return true
  try {
    const parsed: unknown = JSON.parse(rawBody)
    // JSON.parse plus stringify naturally shortens float trailing
    // zeros (0.940 parses to 0.94 and prints back as 0.94).
    const canonical = JSON.stringify(sortKeysDeep(parsed))
    const canonicalHmac = createHmac('sha256', secret).update(canonical).digest('hex')
    return safeEqualHex(given, canonicalHmac)
  } catch {
    return false
  }
}

// --- Verdict mapping ---------------------------------------------------

export interface DiditDecisionSummary {
  status: string
  idStatus: string | null
  faceStatus: string | null
  faceSimilarityPct: number | null
  livenessStatus: string | null
  documentType: string | null
}

export function summarizeDiditDecision(
  status: string,
  decision: Record<string, unknown>
): DiditDecisionSummary {
  const idEntry = asRecord(Array.isArray(decision.id_verifications) ? decision.id_verifications[0] : null)
  const faceEntry = asRecord(Array.isArray(decision.face_matches) ? decision.face_matches[0] : null)
  const livenessEntry = asRecord(
    Array.isArray(decision.liveness_checks) ? decision.liveness_checks[0] : null
  )
  const simRaw = Number(faceEntry.similarity_score)
  let faceSimilarityPct: number | null = null
  if (Number.isFinite(simRaw)) {
    faceSimilarityPct = Math.round(simRaw <= 1 ? simRaw * 100 : simRaw)
  }
  return {
    status,
    idStatus: typeof idEntry.status === 'string' ? idEntry.status : null,
    faceStatus: typeof faceEntry.status === 'string' ? faceEntry.status : null,
    faceSimilarityPct,
    livenessStatus: typeof livenessEntry.status === 'string' ? livenessEntry.status : null,
    documentType: typeof idEntry.document_type === 'string' ? idEntry.document_type : null,
  }
}

async function markDiditState(
  db: SupabaseClient,
  row: VerificationRowForAutomation,
  fields: Record<string, unknown>
): Promise<void> {
  await db
    .from('verifications')
    .update({ ...fields, automated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending')
}

export type DiditOutcome = 'approved' | 'rejected' | 'manual_review' | 'ended' | 'ignored'

// Applies one terminal or intermediate Didit session status to a
// pending verifications row. `decision` is the Didit decision object
// (from the webhook payload or the decision endpoint); it is stored
// sanitized on the row either way.
export async function applyDiditOutcome(
  db: SupabaseClient,
  row: VerificationRowForAutomation,
  status: string,
  decision: Record<string, unknown>
): Promise<DiditOutcome> {
  const summary = summarizeDiditDecision(status, decision)
  const stored = sanitizeProviderResult({ diditStatus: status, summary, decision })

  if (status === 'Approved') {
    const decided = await applyVerificationDecision(db, {
      row,
      approve: true,
      notes:
        'Approved automatically by Didit: the ID check, liveness check and face match all passed.',
      automationStatus: 'approved',
      provider: 'didit',
      providerResult: stored,
      providerConfidence: summary.faceSimilarityPct,
      decisionSource: 'didit_webhook',
    })
    return decided ? 'approved' : 'ignored'
  }

  if (status === 'Declined') {
    const clearFail = summary.idStatus === 'Declined' && summary.faceStatus === 'Declined'
    if (clearFail) {
      const decided = await applyVerificationDecision(db, {
        row,
        approve: false,
        notes:
          'The ID check and the face match both failed. Please submit a genuine ID and a clear selfie of yourself.',
        automationStatus: 'rejected',
        provider: 'didit',
        providerResult: stored,
        providerConfidence: summary.faceSimilarityPct,
        decisionSource: 'didit_webhook',
      })
      return decided ? 'rejected' : 'ignored'
    }
    await markDiditState(db, row, {
      automation_status: 'manual_review',
      provider: 'didit',
      provider_result: stored,
      provider_confidence: summary.faceSimilarityPct,
      decision_source: 'didit_webhook',
    })
    return 'manual_review'
  }

  if (status === 'In Review' || status === 'Resubmitted') {
    await markDiditState(db, row, {
      automation_status: 'manual_review',
      provider: 'didit',
      provider_result: stored,
      provider_confidence: summary.faceSimilarityPct,
      decision_source: 'didit_webhook',
    })
    return 'manual_review'
  }

  if (
    status === 'Expired' ||
    status === 'Abandoned' ||
    status === 'Not Finished' ||
    status === 'Kyc Expired'
  ) {
    // The hosted session ended without a verdict. The row stays
    // pending for the manual path and the companion can start again.
    await markDiditState(db, row, {
      automation_status: 'error',
      provider: 'didit',
      provider_result: stored,
      decision_source: 'didit_webhook',
    })
    return 'ended'
  }

  return 'ignored'
}
