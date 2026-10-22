import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  evaluateEligibility,
  hasRequirements,
} from '@/lib/connections/eligibility';
import { isServiceType } from '@/lib/connections/serviceType';
import { notifyUsers } from '@/lib/push-server';
import {
  requirementsFor,
  intakeQuestionsFor,
  maybeGrantReferralReward,
} from '@/lib/payments/settleConnection';
import { normalizeBoardIntake } from '@/lib/board/board';
import {
  loadHeldFee,
  feeConsumed,
  isProviderUnavailable,
} from '@/lib/payments/heldFee';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/connections/apply-fee
 * Apply a held connection fee (paid up front, never used) to a
 * companion: the pay-first switch. The fee moves once, from the
 * companion it was paid for to the companion the client picks
 * instead, and opens a normal connection with her.
 *
 * Nothing about the fence moves: no connection, no chat, no
 * contact until this call creates the connection, and the new
 * companion's requirements and screening questions bind exactly
 * as they do in a fresh booking (answers are shape-checked and
 * leak-scanned by the same normalizer the board uses). Her own
 * rate negotiation is untouched: proposed_rate_ngn is recorded on
 * the connection for the chat, exactly as in the direct flow.
 * Body: { payment_ref, provider_id, proposed_rate_ngn?, service_type?, intakeAnswers? }
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    payment_ref?: string;
    provider_id?: string;
    proposed_rate_ngn?: number | null;
    service_type?: string | null;
    intakeAnswers?: unknown;
  } | null;
  if (!body?.payment_ref || !body?.provider_id) {
    return NextResponse.json(
      { error: 'payment_ref and provider_id are required' },
      { status: 400 }
    );
  }
  if (body.provider_id === user.id) {
    return NextResponse.json(
      { error: 'You cannot connect with yourself' },
      { status: 400 }
    );
  }
  const serviceType = body.service_type ?? null;
  if (serviceType !== null && !isServiceType(serviceType)) {
    return NextResponse.json({ error: 'Unknown service type' }, { status: 400 });
  }

  const svc = service();

  const fee = await loadHeldFee(svc, body.payment_ref);
  if (!fee || fee.userId !== user.id) {
    return NextResponse.json(
      { error: 'We could not find a settled connection fee with that reference.' },
      { status: 404 }
    );
  }
  if (fee.disposition === 'refunded' || fee.disposition === 'refund_pending') {
    return NextResponse.json(
      { error: 'This fee is already on its way back to you as a refund, so it can no longer be applied.' },
      { status: 409 }
    );
  }
  if (fee.disposition !== 'open' || (await feeConsumed(svc, fee.reference))) {
    return NextResponse.json(
      { error: 'This fee has already been used for a connection.' },
      { status: 409 }
    );
  }

  const { data: existing } = await svc
    .from('connections')
    .select('id')
    .eq('client_id', user.id)
    .eq('provider_id', body.provider_id)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: 'You are already connected with this companion, so the fee stays held for someone else.' },
      { status: 409 }
    );
  }

  // The switch lands only on a companion who can take it up now.
  if (await isProviderUnavailable(svc, body.provider_id)) {
    return NextResponse.json(
      {
        error: 'She is not available right now either. Your fee stays held: pick a companion who is available, or take the refund.',
        feeHeld: true,
      },
      { status: 409 }
    );
  }

  const reqs = await requirementsFor(svc, body.provider_id);
  if (!reqs) return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
  if (hasRequirements(reqs)) {
    const result = await evaluateEligibility(svc, user.id, user.created_at ?? null, reqs);
    if (!result.eligible) {
      return NextResponse.json(
        { error: 'You do not meet this companion’s requirements yet.', checks: result.checks },
        { status: 403 }
      );
    }
  }

  const questions = await intakeQuestionsFor(svc, body.provider_id);
  const intake = normalizeBoardIntake(body.intakeAnswers, questions);
  if (intake.error) {
    return NextResponse.json(
      {
        error: intake.error,
        needsIntake: true,
        questions,
      },
      { status: 400 }
    );
  }

  // Claim the fee before creating anything: the guarded update is
  // the one switch being spent, and it closes the race with a
  // refund attempt or a second apply running at the same moment.
  const table = fee.rail === 'card' ? 'card_payments' : 'crypto_payments';
  const { data: claimed } = await svc
    .from(table)
    .update({
      fee_disposition: 'applied',
      applied_provider_id: body.provider_id,
      updated_at: new Date().toISOString(),
    })
    .eq('reference', fee.reference)
    .eq('fee_disposition', 'open')
    .select('reference')
    .maybeSingle();
  if (!claimed) {
    return NextResponse.json(
      { error: 'This fee has already been used for a connection.' },
      { status: 409 }
    );
  }
  const releaseClaim = async () => {
    await svc
      .from(table)
      .update({
        fee_disposition: 'open',
        applied_provider_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('reference', fee.reference)
      .eq('fee_disposition', 'applied');
  };

  const now = new Date();
  const { data: inserted, error } = await svc
    .from('connections')
    .insert({
      client_id: user.id,
      provider_id: body.provider_id,
      // The fee on the connection is what he actually paid; the
      // payment row is the receipt.
      fee_ngn: fee.amountNgn,
      status: 'active',
      fee_state: 'held',
      paid_at: now.toISOString(),
      dispute_deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      payment_ref: fee.reference,
      proposed_rate_ngn:
        typeof body.proposed_rate_ngn === 'number' && body.proposed_rate_ngn > 0
          ? body.proposed_rate_ngn
          : null,
      service_type: serviceType,
      intake_answers: intake.answers,
    })
    .select('id')
    .single();
  if (error || !inserted) {
    await releaseClaim().catch(() => {});
    return NextResponse.json(
      { error: 'Could not create the connection. Your fee is still held and safe.' },
      { status: 500 }
    );
  }

  await maybeGrantReferralReward(svc, user.id, inserted.id);

  await notifyUsers({
    userIds: [body.provider_id],
    type: 'new_connection',
    title: 'New connection',
    body: 'A client just connected with you. Say hello in Messages.',
    link: '/bookings',
  }).catch(() => {});

  return NextResponse.json({ success: true, id: inserted.id });
}
