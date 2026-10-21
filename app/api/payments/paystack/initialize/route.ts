import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  paystackConfigured,
  initializeTransaction,
  isPaymentChannel,
  type PaymentChannel,
} from '@/lib/payments/paystack';
import {
  evaluateEligibility,
  hasRequirements,
} from '@/lib/connections/eligibility';
import { isServiceType } from '@/lib/connections/serviceType';
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck';

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

interface IntakeAnswer {
  q: string;
  a: string;
}

/**
 * The same validation POST /api/connections applies to screening
 * answers: at most 3, trimmed, and every answer passes the contact
 * leak scanner. The answers are stored on the payment row here so
 * they survive the hosted-checkout redirect as server-side truth;
 * sessionStorage on the client is only a fallback.
 */
function normalizeIntakeAnswers(
  raw: unknown
): { answers: IntakeAnswer[] | null; error: string | null } {
  if (raw === undefined || raw === null) return { answers: null, error: null };
  if (!Array.isArray(raw)) {
    return { answers: null, error: 'intakeAnswers must be an array' };
  }
  if (raw.length > 3) {
    return { answers: null, error: 'Answer at most 3 questions' };
  }
  const answers: IntakeAnswer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { answers: null, error: 'Each answer needs a question and an answer' };
    }
    const q = (item as { q?: unknown }).q;
    const a = (item as { a?: unknown }).a;
    if (typeof q !== 'string' || typeof a !== 'string') {
      return { answers: null, error: 'Each answer needs a question and an answer' };
    }
    const answer = a.trim().slice(0, 300);
    if (!answer) {
      return { answers: null, error: 'Please answer every question' };
    }
    const scan = scanForLeaks(answer);
    if (!scan.clean) {
      return { answers: null, error: leakWarning(scan.leaks) };
    }
    answers.push({ q: q.trim().slice(0, 120), a: answer });
  }
  return { answers, error: null };
}

/**
 * POST /api/payments/paystack/initialize
 * Starts Paystack checkout for the connection fee. Eligibility is
 * checked here, before money moves, and the fee comes from
 * platform_settings.
 * Body: { provider_id, channel?, intakeAnswers?, service_type? }
 * where channel is "card" or "bank_transfer". Transfer shows the
 * buyer a dedicated account number on the checkout and settles
 * through the same webhook. The screening answers and the service
 * pick are validated here and stored on the payment row, so the
 * callback can open the connection from server-side truth even when
 * the client's sessionStorage stash does not survive the redirect.
 * Returns { authorizationUrl, reference }.
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

  const body = (await req.json().catch(() => null)) as {
    provider_id?: string;
    channel?: unknown;
    intakeAnswers?: unknown;
    service_type?: string | null;
  } | null;
  if (!body?.provider_id) {
    return NextResponse.json({ error: 'provider_id is required' }, { status: 400 });
  }
  if (body.channel !== undefined && !isPaymentChannel(body.channel)) {
    return NextResponse.json(
      { error: 'channel must be "card" or "bank_transfer"' },
      { status: 400 }
    );
  }
  const channel: PaymentChannel | undefined = isPaymentChannel(body.channel)
    ? body.channel
    : undefined;

  // The service pick and the screening answers ride on the payment
  // row. Both are optional (older clients send neither), but when
  // present they must be valid: an unknown service key or a dirty
  // answer is refused here, before any checkout exists.
  const serviceType = body.service_type ?? null;
  if (serviceType !== null && !isServiceType(serviceType)) {
    return NextResponse.json({ error: 'Unknown service type' }, { status: 400 });
  }
  const intake = normalizeIntakeAnswers(body.intakeAnswers);
  if (intake.error) {
    return NextResponse.json({ error: intake.error }, { status: 400 });
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
    intake_answers: intake.answers,
    service_type: serviceType,
  });
  if (insErr) {
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 });
  }

  try {
    const { authorizationUrl } = await initializeTransaction({
      email: user.email ?? `${user.id}@intima.user`,
      amountNgn: fee,
      reference,
      channel,
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
