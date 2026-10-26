import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  getPaystackMode,
  paystackConfigForMode,
  paystackConfiguredFor,
  type PaystackMode,
} from '@/lib/payments/paystack'

export const dynamic = 'force-dynamic'

// The Test / Live switch for Paystack itself, the pattern this
// platform imitates. The mode lives in platform_settings
// ('paystack_mode') and decides which secret key every money call
// uses. Both key sets live in env (the test set falls back to
// PAYSTACK_SECRET_KEY); flipping this switch never needs a
// redeploy, and the webhook accepts signatures from both keys so
// a charge started before a flip still settles after it.

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
  const mode = await getPaystackMode(svc)
  return NextResponse.json({
    mode,
    testConfigured: paystackConfiguredFor(paystackConfigForMode('test')),
    liveConfigured: paystackConfiguredFor(paystackConfigForMode('live')),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { mode?: unknown } | null
  const mode: PaystackMode | null =
    body?.mode === 'live' ? 'live' : body?.mode === 'test' ? 'test' : null
  if (!mode) {
    return NextResponse.json({ error: 'Mode must be "test" or "live".' }, { status: 400 })
  }

  const svc = serviceDb()
  const previous = await getPaystackMode(svc)
  const { error } = await svc.from('platform_settings').upsert(
    {
      key: 'paystack_mode',
      value: mode,
      description:
        'Which Paystack secret key Intima uses for payments: test or live.',
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
      action: 'paystack_mode_changed',
      target_type: 'platform_setting',
      target_id: 'paystack_mode',
      details: { old_value: previous, new_value: mode },
    })
  } catch {
    // The audit trail is best effort; the switch itself has landed.
  }

  return NextResponse.json({ ok: true, mode })
}
