import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createVerificationServiceDb,
  runVerificationAutomation,
  type VerificationRowForAutomation,
} from '@/lib/verification/automation'

export const dynamic = 'force-dynamic'

// POST { id?: string }
// Runs the automated provider check for one of the signed-in user's
// own pending verification submissions (the latest pending one when
// no id is given). Env-gated: with no provider keys set it records
// 'not_configured' and leaves the manual flow completely untouched.
// The verification page calls this fire-and-forget right after a
// submission lands, so a slow provider can never block the submit
// button the user just tapped.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as { id?: string } | null
  const db = createVerificationServiceDb()

  let query = db
    .from('verifications')
    .select('id, provider_id, status, id_document_url, selfie_url, sign_selfie_url, id_type')
    .eq('provider_id', user.id)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false })
    .limit(1)
  if (body?.id) query = query.eq('id', body.id)

  const { data: rows, error } = await query
  if (error) {
    return NextResponse.json({ error: 'Could not load the submission.' }, { status: 500 })
  }
  const row = (rows?.[0] ?? null) as VerificationRowForAutomation | null
  if (!row) {
    return NextResponse.json({ ok: true, automated: false, outcome: 'no_pending_submission' })
  }

  try {
    const result = await runVerificationAutomation(db, row)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('verification dispatch failed', err)
    return NextResponse.json(
      { ok: false, automated: false, outcome: 'error' },
      { status: 500 }
    )
  }
}
