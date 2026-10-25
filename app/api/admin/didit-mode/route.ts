import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  diditConfigForMode,
  diditConfigured,
  getDiditMode,
  type DiditMode,
} from '@/lib/verification/didit'

export const dynamic = 'force-dynamic'

// The Paystack style Test / Live switch for Didit verification.
// The mode lives in platform_settings ('didit_mode') and decides
// which Didit application's credentials the app uses. Both sets of
// keys live in env; flipping this switch never needs a redeploy.

function serviceDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role as string)) return null
  return user
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const svc = serviceDb()
  const mode = await getDiditMode(svc)
  return NextResponse.json({
    mode,
    sandboxConfigured: diditConfigured(diditConfigForMode('sandbox')),
    liveConfigured: diditConfigured(diditConfigForMode('live')),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { mode?: unknown } | null
  const mode: DiditMode | null =
    body?.mode === 'live' ? 'live' : body?.mode === 'sandbox' ? 'sandbox' : null
  if (!mode) {
    return NextResponse.json({ error: 'Mode must be "sandbox" or "live".' }, { status: 400 })
  }

  const svc = serviceDb()
  const previous = await getDiditMode(svc)
  const { error } = await svc.from('platform_settings').upsert(
    {
      key: 'didit_mode',
      value: mode,
      description:
        'Which Didit application Intima uses for instant verification: sandbox (test) or live.',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  )
  if (error) {
    return NextResponse.json({ error: 'Could not save the mode.' }, { status: 500 })
  }

  try {
    await svc.from('admin_audit_logs').insert({
      admin_id: user.id,
      action: 'didit_mode_changed',
      target_type: 'platform_setting',
      target_id: 'didit_mode',
      details: { old_value: previous, new_value: mode },
    })
  } catch {
    // The audit trail is best effort; the switch itself has landed.
  }

  return NextResponse.json({ ok: true, mode })
}
