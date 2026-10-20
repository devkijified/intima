import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  evaluateEligibility,
  hasRequirements,
  type CompanionRequirements,
} from '@/lib/connections/eligibility';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requirementsFor(
  svc: ReturnType<typeof service>,
  providerId: string
): Promise<CompanionRequirements | null> {
  const { data } = await svc
    .from('profiles')
    .select('req_verified_client, req_min_connections, req_min_account_days')
    .eq('id', providerId)
    .maybeSingle();
  if (!data) return null;
  return {
    req_verified_client: data.req_verified_client === true,
    req_min_connections: data.req_min_connections ?? 0,
    req_min_account_days: data.req_min_account_days ?? 0,
  };
}

/**
 * GET /api/connections?provider_id=...
 * Pre-check shown before payment: does this client meet the companion's
 * requirements (Bybit counterparty conditions)? Returns the checks.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const providerId = req.nextUrl.searchParams.get('provider_id');
  if (!providerId) {
    return NextResponse.json({ error: 'provider_id is required' }, { status: 400 });
  }

  const svc = service();
  const reqs = await requirementsFor(svc, providerId);
  if (!reqs) return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
  if (!hasRequirements(reqs)) {
    return NextResponse.json({ eligible: true, checks: [] });
  }
  const result = await evaluateEligibility(svc, user.id, user.created_at ?? null, reqs);
  return NextResponse.json(result);
}

/**
 * POST /api/connections
 * The authoritative create. The fee comes from platform_settings on
 * the server, eligibility is re-checked here (never trusted from the
 * client), and the row is inserted with the service role.
 * Body: { provider_id, payment_ref, proposed_rate_ngn? }
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    provider_id?: string;
    payment_ref?: string;
    proposed_rate_ngn?: number | null;
  } | null;
  if (!body?.provider_id || !body?.payment_ref) {
    return NextResponse.json(
      { error: 'provider_id and payment_ref are required' },
      { status: 400 }
    );
  }
  if (body.provider_id === user.id) {
    return NextResponse.json(
      { error: 'You cannot connect with yourself' },
      { status: 400 }
    );
  }

  const svc = service();

  const reqs = await requirementsFor(svc, body.provider_id);
  if (!reqs) return NextResponse.json({ error: 'Companion not found' }, { status: 404 });

  if (hasRequirements(reqs)) {
    const result = await evaluateEligibility(svc, user.id, user.created_at ?? null, reqs);
    if (!result.eligible) {
      return NextResponse.json(
        {
          error: 'You do not meet this companion’s requirements yet.',
          checks: result.checks,
        },
        { status: 403 }
      );
    }
  }

  const { data: setting } = await svc
    .from('platform_settings')
    .select('value')
    .eq('key', 'connection_fee_ngn')
    .maybeSingle();
  const fee = Number(setting?.value ?? 5000);

  const { data: existing } = await svc
    .from('connections')
    .select('id')
    .eq('client_id', user.id)
    .eq('provider_id', body.provider_id)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ success: true, alreadyConnected: true, id: existing.id });
  }

  const { data: inserted, error } = await svc
    .from('connections')
    .insert({
      client_id: user.id,
      provider_id: body.provider_id,
      fee_ngn: fee,
      status: 'active',
      payment_ref: body.payment_ref,
      proposed_rate_ngn:
        typeof body.proposed_rate_ngn === 'number' && body.proposed_rate_ngn > 0
          ? body.proposed_rate_ngn
          : null,
    })
    .select('id')
    .single();
  if (error) {
    return NextResponse.json({ error: 'Could not create the connection' }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: inserted.id });
}
