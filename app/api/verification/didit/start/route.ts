import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createVerificationServiceDb } from '@/lib/verification/automation'
import { createDiditSession, diditConfigured } from '@/lib/verification/didit'

export const dynamic = 'force-dynamic'

// GET: tells the verification page whether the instant Didit flow
// is available, so the card only renders when it can work.
export async function GET() {
  return NextResponse.json({ configured: diditConfigured() })
}

// POST: starts a hosted Didit verification session for the signed-in
// user and returns the URL to send them to. The session is anchored
// to the user's current pending verifications row (created empty
// when they have none), so the webhook verdict lands on the same row
// the admin queue and the profile already read.
export async function POST() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }
  if (!diditConfigured()) {
    return NextResponse.json(
      { error: 'Instant verification is not available right now.' },
      { status: 503 }
    )
  }

  const db = createVerificationServiceDb()

  const { data: pendingRows, error: loadError } = await db
    .from('verifications')
    .select('id')
    .eq('provider_id', user.id)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false })
    .limit(1)
  if (loadError) {
    return NextResponse.json({ error: 'Could not load your submission.' }, { status: 500 })
  }

  let rowId = (pendingRows?.[0]?.id as string | undefined) ?? null
  if (!rowId) {
    const { data: inserted, error: insertError } = await db
      .from('verifications')
      .insert({ provider_id: user.id, status: 'pending' })
      .select('id')
      .single()
    if (insertError || !inserted) {
      return NextResponse.json({ error: 'Could not start verification.' }, { status: 500 })
    }
    rowId = inserted.id as string
  }

  try {
    const session = await createDiditSession(rowId)
    const { error: anchorError } = await db
      .from('verifications')
      .update({
        provider: 'didit',
        provider_reference: session.sessionId,
        automation_status: 'processing',
        decision_source: 'didit',
        automated_at: new Date().toISOString(),
      })
      .eq('id', rowId)
      .eq('status', 'pending')
    if (anchorError) {
      // The session exists and the webhook can still find this row
      // through vendor_data, so the user flow continues; log the
      // failure instead of letting it pass silently.
      try {
        await db.from('error_logs').insert({
          message: 'Didit session anchor update failed',
          route: '/api/verification/didit/start',
          source: 'server',
          user_id: user.id,
          stack_head: anchorError.message.slice(0, 2000),
        })
      } catch {
        // Logging is best effort only.
      }
    }
    await db.from('profiles').update({ verification_status: 'pending' }).eq('id', user.id)
    return NextResponse.json({ ok: true, url: session.url, sessionId: session.sessionId })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    try {
      await db.from('error_logs').insert({
        message: 'Didit session start failed',
        route: '/api/verification/didit/start',
        source: 'server',
        user_id: user.id,
        stack_head: detail.slice(0, 2000),
      })
    } catch {
      // Logging is best effort only.
    }
    return NextResponse.json(
      { error: 'The verification service could not start. Please try again.' },
      { status: 502 }
    )
  }
}
