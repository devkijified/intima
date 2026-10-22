import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  evaluateEligibility,
  hasRequirements,
} from '@/lib/connections/eligibility';
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck';
import { notifyUsers } from '@/lib/push-server';
import { verifyConnectionFeePayment } from '@/lib/payments/connectionFee';
import {
  requirementsFor,
  intakeQuestionsFor,
  maybeGrantReferralReward,
  type IntakeAnswer,
} from '@/lib/payments/settleConnection';
import { isServiceType } from '@/lib/connections/serviceType';
import {
  loadHeldFee,
  isProviderUnavailable,
  materializeHold,
  stampApplied,
} from '@/lib/payments/heldFee';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Validate the shape of client-supplied intake answers. Returns the
 * normalized answers, or an error message. Answers are user text, so
 * every answer passes the contact leak scanner here: no phone numbers
 * or off-platform routes ride in on a screening answer.
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
 * client), the payment_ref is proven against the settled gateway row
 * (a reference alone is a claim, not a payment), and the row is
 * inserted with the service role.
 * Body: { provider_id, payment_ref, proposed_rate_ngn?, service_type?, intakeAnswers? }
 * intakeAnswers are the client's answers to the companion's screening
 * questions: shape-checked and leak-scanned here before storage.
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
    pay_with_coins?: boolean;
    proposed_rate_ngn?: number | null;
    service_type?: string | null;
    intakeAnswers?: unknown;
  } | null;
  const payWithCoins = body?.pay_with_coins === true;
  if (!body?.provider_id || (!body?.payment_ref && !payWithCoins)) {
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

  // What the request is for: a known key or nothing. Anything else
  // is a malformed client, refused before any money logic runs.
  const serviceType = body.service_type ?? null;
  if (serviceType !== null && !isServiceType(serviceType)) {
    return NextResponse.json({ error: 'Unknown service type' }, { status: 400 });
  }

  // Intake answers: validate shape and scan for contact leaks first,
  // so a dirty answer is blocked even before eligibility runs.
  const intake = normalizeIntakeAnswers(body.intakeAnswers);
  if (intake.error) {
    return NextResponse.json({ error: intake.error }, { status: 400 });
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

  // Pay-first availability gate (migration 078): the fee buys a
  // connection with a companion who is actually available. Her
  // presence row is the authority, the same definition the
  // request modal uses. The check runs before any money logic:
  // the wallet rail must not spend against an offline companion,
  // and a gateway fee that already settled is held, never spent
  // on a connection she cannot take up.
  const targetUnavailable = await isProviderUnavailable(svc, body.provider_id);
  if (payWithCoins && targetUnavailable) {
    return NextResponse.json(
      {
        error:
          'She is not available right now, so no connection was opened and your wallet has not been charged. Pick a companion who is available and try again.',
      },
      { status: 409 }
    );
  }

  // Payment proof, before anything is created: the reference must
  // resolve to a settled card_payments or crypto_payments row for
  // this caller, this companion, and the current fee, and must not
  // already have opened a connection. Without this, any invented
  // reference would bypass the fee entirely. The coins rail skips
  // the gateway proof: its spend below is the proof, checked
  // against the live balance by spend_coins itself.
  if (!payWithCoins) {
    const proof = await verifyConnectionFeePayment(svc, {
      userId: user.id,
      providerId: body.provider_id,
      paymentRef: body.payment_ref!,
      feeNgn: fee,
    });
    if (!proof.ok) {
      return NextResponse.json({ error: proof.error }, { status: proof.status });
    }
    // The fee's own lifecycle binds too: a fee already claimed by
    // an apply (or sitting on the refund path) must not open a
    // second connection from this call while the other completes.
    const heldFee = await loadHeldFee(svc, body.payment_ref!);
    if (heldFee && heldFee.disposition === 'applied') {
      return NextResponse.json(
        { error: 'This payment has already been used for a connection.' },
        { status: 409 }
      );
    }
    if (heldFee && heldFee.disposition !== 'open') {
      return NextResponse.json(
        {
          error:
            'This fee is already being refunded, so it can no longer open a connection. If the refund has not landed in a few days, contact support.',
        },
        { status: 409 }
      );
    }
    if (targetUnavailable) {
      // The fee is real and settled, but she cannot take it up:
      // stamp it held so the client can apply it to an available
      // companion or take the refund_pct refund, and say so in the
      // response (feeHeld) so the caller can route him there.
      if (heldFee) await materializeHold(svc, heldFee).catch(() => {});
      return NextResponse.json(
        {
          error:
            'She is not available right now, so no connection was opened. Your fee is held safely: apply it to another available companion, or take a refund.',
          feeHeld: true,
          payment_ref: body.payment_ref,
        },
        { status: 409 }
      );
    }
  }

  // If she asks screening questions, answers are required to connect.
  const questions = await intakeQuestionsFor(svc, body.provider_id);
  let intakeAnswers: IntakeAnswer[] | null = null;
  if (questions.length > 0) {
    if (!intake.answers || intake.answers.length < questions.length) {
      return NextResponse.json(
        { error: 'Please answer her screening questions first' },
        { status: 400 }
      );
    }
    // Store the companion's own question text, not the client echo.
    intakeAnswers = questions.map((q, i) => ({ q, a: intake.answers![i].a }));
  } else if (intake.answers && intake.answers.length > 0) {
    intakeAnswers = intake.answers;
  }

  // Coins rail: spend the fee from the wallet now that every
  // refusal reason has been cleared. spend_coins is atomic and
  // balance-checked in the database. The ledger ref doubles as the
  // connection's payment_ref; a compensating credit (distinct ref,
  // so the ledger idempotency index never confuses the two) undoes
  // the spend if the insert below fails.
  let paymentRef = body.payment_ref!;
  if (payWithCoins) {
    const feeCoins = Math.ceil(fee / 10);
    paymentRef = `COINS-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const { error: spendErr } = await svc.rpc('spend_coins', {
      p_user_id: user.id,
      p_amount: feeCoins,
      p_kind: 'connection_fee',
      p_ref: paymentRef,
      p_meta: { provider_id: body.provider_id },
    });
    if (spendErr) {
      if (String(spendErr.message).includes('insufficient_balance')) {
        return NextResponse.json(
          { error: `Your wallet does not hold enough coins for the ${'₦'}${fee.toLocaleString('en-NG')} fee. Top up or pay by card.` },
          { status: 402 }
        );
      }
      return NextResponse.json(
        { error: 'We could not take the fee from your wallet. Please try again.' },
        { status: 500 }
      );
    }
  }

  const now = new Date();
  const { data: inserted, error } = await svc
    .from('connections')
    .insert({
      client_id: user.id,
      provider_id: body.provider_id,
      fee_ngn: fee,
      status: 'active',
      // The fee sits in its 24 hour protection window from the moment
      // the connection activates; either side can dispute it in chat.
      fee_state: 'held',
      paid_at: now.toISOString(),
      dispute_deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      payment_ref: paymentRef,
      proposed_rate_ngn:
        typeof body.proposed_rate_ngn === 'number' && body.proposed_rate_ngn > 0
          ? body.proposed_rate_ngn
          : null,
      service_type: serviceType,
      intake_answers: intakeAnswers,
    })
    .select('id')
    .single();
  if (error) {
    if (payWithCoins) {
      try {
        await svc.rpc('credit_coins', {
          p_user_id: user.id,
          p_amount: Math.ceil(fee / 10),
          p_kind: 'connection_fee',
          p_ref: `${paymentRef}-refund`,
          p_meta: { provider_id: body.provider_id, reason: 'connection_insert_failed' },
        });
      } catch {
        /* the credit is idempotent on its ref; a later reconcile can retry */
      }
    }
    return NextResponse.json({ error: 'Could not create the connection' }, { status: 500 });
  }

  // A gateway fee is now consumed: stamp the payment row applied
  // so its lifecycle states who it finally connected. Best effort;
  // the connection itself is the primary record. Coins have no
  // payment row (the ledger spend is the record), so they skip it.
  if (!payWithCoins) {
    const heldFee = await loadHeldFee(svc, paymentRef);
    if (heldFee) {
      await stampApplied(svc, heldFee, body.provider_id).catch(() => {});
    }
  }

  // Genuinely new connection: the only path that can pay a referral.
  await maybeGrantReferralReward(svc, user.id, inserted.id);

  // Tell the companion right away (bell row plus push, best effort): a new
  // paid connection is the moment this platform exists for, and a companion
  // who hears about it late is a client left waiting.
  await notifyUsers({
    userIds: [body.provider_id],
    type: 'new_connection',
    title: 'New connection',
    body: 'A client just connected with you. Say hello in Messages.',
    link: '/bookings',
  });

  return NextResponse.json({ success: true, id: inserted.id });
}
