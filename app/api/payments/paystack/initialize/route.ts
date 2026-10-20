import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  paystackConfigured,
  initializeTransaction,
} from '@/lib/payments/paystack';
import {
  evaluateEligibility,
  hasRequirements,
} from '@/lib/connections/eligibility';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function makeReference(): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CARD-${rand}`;
}

/**
 * POST /api/payments/paystack/initialize
 * Starts card checkout for the connection fee. Eligibility is checked
 * here, before money moves, and the fee comes from platform_settings.
 * Body: { provider_id }. Returns { authorizationUrl, reference }.
 */
export async function POST(req: NextRequest) {
  if (!paystackConfigured()) {
    return NextResponse.json(
      { error: 'Card payments are not switched on yet.' },
      { status: 503 }
    );
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { provider_id?: string } | null;
  if (!body?.provider_id) {
    return NextResponse.json({ error: 'provider_id is required' }, { status: 400 });
  }
  if (body.provider_id === user.id) {
    return NextResponse.json(
      { error: 'You cannot connect with yourself' },
      { status: 400 }
    );
  }

  const svc = service();

  const { data: target } = await svc
    .from('profiles')
    .select('req_verified_client, req_min_connections, req_min_account_days')
    .eq('id', body.provider_id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
  }
  const reqs = {
    req_verified_client: target.req_verified_client === true,
    req_min_connections: target.req_min_connections ?? 0,
    req_min_account_days: target.req_min_account_days ?? 0,
  };
  if (hasRequirements(reqs)) {
    const result = await evaluateEligibility(svc, user.id, user.created_at ?? null, reqs);
    if (!result.eligible) {
      return NextResponse.json(
        { error: 'You do not meet this companion’s requirements yet.', checks: result.checks },
        { status: 403 }
      );
    }
  }

  const { data: feeRow } = await svc
    .from('platform_settings')
    .select('value')
    .eq('key', 'connection_fee_ngn')
    .maybeSingle();
  const fee = Number(feeRow?.value ?? 5000);

  const reference = makeReference();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  const { error: insErr } = await svc.from('card_payments').insert({
    user_id: user.id,
    kind: 'connection_fee',
    reference,
    amount_ngn: fee,
    target_provider_id: body.provider_id,
    status: 'pending',
  });
  if (insErr) {
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 });
  }

  try {
    const { authorizationUrl } = await initializeTransaction({
      email: user.email ?? `${user.id}@intima.user`,
      amountNgn: fee,
      reference,
      callbackUrl: `${origin}/payments/callback?ref=${reference}`,
      metadata: {
        kind: 'connection_fee',
        user_id: user.id,
        provider_id: body.provider_id,
        custom_fields: [
          { display_name: 'Purpose', variable_name: 'purpose', value: 'Intima connection fee' },
        ],
      },
    });
    return NextResponse.json({ authorizationUrl, reference });
  } catch (e) {
    await svc
      .from('card_payments')
      .update({ status: 'failed' })
      .eq('reference', reference);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Gateway error' },
      { status: 502 }
    );
  }
}
