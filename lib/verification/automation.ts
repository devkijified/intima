// Server-only automated identity verification for Intima.
//
// Design: adapter-shaped around Dojah's two synchronous KYC calls,
// which fit the documents users already submit (an ID photo and a
// selfie holding that ID):
//   1. POST /api/v1/document/analysis  (authenticity + field read)
//   2. POST /api/v1/kyc/photoid/verify (face on the ID vs the selfie)
// The handwritten sign selfie is not sent anywhere; it stays in the
// private bucket as the human fallback artefact for the admin queue.
//
// Decision policy (deliberately conservative for a trust product):
//   - Auto-approve only on a clean pass: document VALID and the face
//     match is true with confidence at or above the threshold
//     (default 80, provider guidance calls 60 a pass and 90 strong).
//   - Auto-reject only on a clear fail: the document is invalid AND
//     the face does not match, or the face match fails with very low
//     confidence (under 40), which reads as a different person rather
//     than a blurry photo.
//   - Everything else (borderline confidence, one check unclear, any
//     provider error) leaves the row pending in the existing admin
//     queue with the provider result stored for the reviewer.
//
// Env gate: with DOJAH_APP_ID / DOJAH_SECRET_KEY unset this module is
// a no-op and the manual flow is untouched. Never import this file
// from client components.
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { notifyUsers } from '@/lib/push-server'

const DOJAH_DOC_ANALYSIS_PATH = '/api/v1/document/analysis'
const DOJAH_FACE_DOC_PATH = '/api/v1/kyc/photoid/verify'

export function createVerificationServiceDb(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export function verificationAutomationConfigured(): boolean {
  return Boolean(process.env.DOJAH_APP_ID && process.env.DOJAH_SECRET_KEY)
}

function dojahBaseUrl(): string {
  const raw = process.env.DOJAH_BASE_URL || process.env.DOJAH_API_BASE_URL || 'https://api.dojah.io'
  return raw.replace(/\/+$/, '')
}

function autoApproveThreshold(): number {
  const n = Number(process.env.DOJAH_FACE_MATCH_AUTO_APPROVE_CONFIDENCE ?? 80)
  if (!Number.isFinite(n)) return 80
  return Math.min(100, Math.max(0, n))
}

export interface VerificationRowForAutomation {
  id: string
  provider_id: string
  status: string
  id_document_url: string | null
  selfie_url: string | null
  sign_selfie_url: string | null
  id_type: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

// Provider responses can embed the document images themselves (the
// analysis call returns a portrait and document pictures). Strip or
// truncate anything image-like or overlong before the result is
// stored in the verifications row.
export function sanitizeProviderResult(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[truncated]'
  if (typeof value === 'string') {
    return value.length > 600 ? `${value.slice(0, 80)}...[truncated]` : value
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => sanitizeProviderResult(v, depth + 1))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length > 200 && /(image|portrait|side|base64)/i.test(k)) {
        out[k] = '[image omitted]'
        continue
      }
      out[k] = sanitizeProviderResult(v, depth + 1)
    }
    return out
  }
  return value
}

async function callDojah(path: string, body: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45_000)
  try {
    const res = await fetch(`${dojahBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        AppId: process.env.DOJAH_APP_ID!,
        // Dojah expects the secret key itself in Authorization, not a
        // Bearer scheme (per the API reference introduction).
        Authorization: process.env.DOJAH_SECRET_KEY!,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const payload: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const message = asRecord(payload).error
      throw new Error(
        `Dojah ${path} failed (${res.status})${typeof message === 'string' ? `: ${message}` : ''}`
      )
    }
    return payload
  } finally {
    clearTimeout(timer)
  }
}

function dojahDocumentType(idType: string | null): string | undefined {
  switch ((idType ?? '').trim().toLowerCase()) {
    case 'nin slip':
      return 'NIN_SLIP'
    case 'international passport':
      return 'PASSPORT'
    case "driver's licence":
    case "driver's license":
      return 'DRIVING_LICENSE'
    case "voter's card":
    case "voters card":
    case "voter's card (pvc)":
      return 'VOTER_CARD'
    default:
      return undefined
  }
}

async function downloadImageBase64(db: SupabaseClient, refValue: string): Promise<string> {
  let blob: Blob
  if (/^https?:\/\//i.test(refValue)) {
    const res = await fetch(refValue)
    if (!res.ok) throw new Error(`Could not download a verification image (${res.status})`)
    blob = await res.blob()
  } else {
    const { data, error } = await db.storage.from('verification-docs').download(refValue)
    if (error || !data) throw new Error('Could not download a verification image')
    blob = data
  }
  const buf = Buffer.from(await blob.arrayBuffer())
  return buf.toString('base64')
}

export interface ApplyDecisionInput {
  row: VerificationRowForAutomation
  approve: boolean
  notes: string
  automationStatus: 'approved' | 'rejected'
  provider: string
  providerResult: unknown
  providerConfidence: number | null
  decisionSource: 'dojah' | 'dojah_webhook' | 'didit' | 'didit_webhook'
}

// Writes a provider decision exactly where the admin route writes a
// manual one (verification row, profile sync, user notification), so
// every downstream reader sees one shape. admin_audit_logs is not
// written here: its admin_id must reference a real admin user, and a
// provider decision has none; the decision is auditable through the
// row's provider, provider_result, decision_source and automated_at.
export async function applyVerificationDecision(
  db: SupabaseClient,
  input: ApplyDecisionInput
): Promise<boolean> {
  const now = new Date().toISOString()
  const { data: updated, error } = await db
    .from('verifications')
    .update({
      status: input.approve ? 'approved' : 'rejected',
      reviewed_by: null,
      reviewed_at: now,
      review_notes: input.notes,
      automation_status: input.automationStatus,
      provider: input.provider,
      provider_result: sanitizeProviderResult(input.providerResult),
      provider_confidence: input.providerConfidence,
      decision_source: input.decisionSource,
      automated_at: now,
    })
    .eq('id', input.row.id)
    .eq('status', 'pending')
    .select('id')
  if (error) throw new Error(error.message)
  if (!updated || updated.length === 0) return false

  const { error: profileError } = await db
    .from('profiles')
    .update({
      // profiles.verification_status uses 'verified' (the value every
      // gate in the app checks), while the verifications row itself
      // uses 'approved'. Keep both exactly as the admin route writes.
      verification_status: input.approve ? 'verified' : 'rejected',
      is_verified: input.approve,
    })
    .eq('id', input.row.provider_id)
  if (profileError) throw new Error(profileError.message)

  await notifyUsers({
    userIds: [input.row.provider_id],
    type: input.approve ? 'verification_approved' : 'verification_rejected',
    title: input.approve ? 'You are verified' : 'Verification not approved',
    body: input.approve
      ? 'Your ID check passed. Your verified badge is now live on your profile.'
      : input.notes,
    link: '/verification',
  })
  return true
}

async function markAutomationState(
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

export interface AutomationRunResult {
  automated: boolean
  outcome: 'approved' | 'rejected' | 'manual_review' | 'not_configured' | 'already_decided' | 'error'
  reason?: string
  confidence?: number | null
  documentValid?: boolean | null
}

export async function runVerificationAutomation(
  db: SupabaseClient,
  row: VerificationRowForAutomation
): Promise<AutomationRunResult> {
  if (row.status !== 'pending') {
    return { automated: false, outcome: 'already_decided' }
  }
  if (!verificationAutomationConfigured()) {
    await markAutomationState(db, row, { automation_status: 'not_configured' })
    return { automated: false, outcome: 'not_configured', reason: 'Provider keys are not set.' }
  }
  if (!row.id_document_url || !row.selfie_url) {
    await markAutomationState(db, row, {
      automation_status: 'manual_review',
      provider: 'dojah',
      provider_result: sanitizeProviderResult({ stage: 'intake', error: 'Missing ID photo or selfie.' }),
    })
    return { automated: false, outcome: 'manual_review', reason: 'Missing documents.' }
  }

  await markAutomationState(db, row, { automation_status: 'processing', provider: 'dojah' })

  let idBase64: string
  let selfieBase64: string
  try {
    ;[idBase64, selfieBase64] = await Promise.all([
      downloadImageBase64(db, row.id_document_url),
      downloadImageBase64(db, row.selfie_url),
    ])
  } catch (err) {
    await markAutomationState(db, row, {
      automation_status: 'error',
      provider_result: sanitizeProviderResult({
        stage: 'download',
        error: err instanceof Error ? err.message : 'Download failed',
      }),
    })
    return { automated: false, outcome: 'error', reason: 'Could not read the submitted images.' }
  }

  const documentType = dojahDocumentType(row.id_type)
  const [docSettled, faceSettled] = await Promise.allSettled([
    callDojah(DOJAH_DOC_ANALYSIS_PATH, {
      input_type: 'base64',
      imagefrontside: idBase64,
      ...(documentType ? { document_type: documentType } : {}),
    }),
    callDojah(DOJAH_FACE_DOC_PATH, {
      photoid_image: idBase64,
      selfie_image: selfieBase64,
    }),
  ])

  if (docSettled.status === 'rejected' || faceSettled.status === 'rejected') {
    const errors: Record<string, string> = {}
    if (docSettled.status === 'rejected') {
      errors.documentAnalysis = docSettled.reason instanceof Error ? docSettled.reason.message : 'Failed'
    }
    if (faceSettled.status === 'rejected') {
      errors.faceDocCompare = faceSettled.reason instanceof Error ? faceSettled.reason.message : 'Failed'
    }
    await markAutomationState(db, row, {
      automation_status: 'error',
      provider_result: sanitizeProviderResult({ stage: 'provider_call', errors }),
    })
    return { automated: false, outcome: 'error', reason: 'The verification provider could not complete the check.' }
  }

  const docEntity = asRecord(asRecord(docSettled.value).entity)
  const docStatus = asRecord(docEntity.status)
  const overall = Number(docStatus.overall_status)
  const documentValid = Number.isFinite(overall) ? overall === 1 : null
  const docReason = typeof docStatus.reason === 'string' ? docStatus.reason : null

  const faceEntity = asRecord(asRecord(faceSettled.value).entity)
  const faceSelfie = asRecord(faceEntity.selfie)
  const faceMatch = typeof faceSelfie.match === 'boolean' ? faceSelfie.match : null
  const confidenceRaw = Number(faceSelfie.confidence_value)
  const confidence = Number.isFinite(confidenceRaw) ? confidenceRaw : null

  const providerResult = {
    documentAnalysis: docSettled.value,
    faceDocCompare: faceSettled.value,
    policy: {
      documentValid,
      documentReason: docReason,
      faceMatch,
      confidence,
      autoApproveThreshold: autoApproveThreshold(),
    },
  }
  const threshold = autoApproveThreshold()

  if (documentValid === true && faceMatch === true && confidence !== null && confidence >= threshold) {
    const decided = await applyVerificationDecision(db, {
      row,
      approve: true,
      notes: `Approved automatically by Dojah: the document passed its checks and the selfie matched the ID photo with ${Math.round(confidence)}% confidence.`,
      automationStatus: 'approved',
      provider: 'dojah',
      providerResult,
      providerConfidence: confidence,
      decisionSource: 'dojah',
    })
    return decided
      ? { automated: true, outcome: 'approved', confidence, documentValid }
      : { automated: false, outcome: 'already_decided' }
  }

  const clearFail =
    (documentValid === false && faceMatch === false) ||
    (faceMatch === false && confidence !== null && confidence < 40)
  if (clearFail) {
    const notes =
      documentValid === false && faceMatch === false
        ? 'The document check failed and the selfie did not match the ID photo. Please submit a genuine ID and a clear selfie holding it.'
        : 'The selfie did not match the ID photo. Please submit a clear selfie holding your own genuine ID.'
    const decided = await applyVerificationDecision(db, {
      row,
      approve: false,
      notes,
      automationStatus: 'rejected',
      provider: 'dojah',
      providerResult,
      providerConfidence: confidence,
      decisionSource: 'dojah',
    })
    return decided
      ? { automated: true, outcome: 'rejected', confidence, documentValid }
      : { automated: false, outcome: 'already_decided' }
  }

  await markAutomationState(db, row, {
    automation_status: 'manual_review',
    provider_result: sanitizeProviderResult(providerResult),
    provider_confidence: confidence,
    decision_source: 'dojah',
  })
  return {
    automated: false,
    outcome: 'manual_review',
    reason: 'The automated checks were not conclusive, so the submission stays with the review team.',
    confidence,
    documentValid,
  }
}
