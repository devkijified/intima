import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  paystackConfiguredFor,
  resolvePaystackConfig,
  initializeTransaction,
  isPaymentChannel,
  type PaymentChannel,
} from '@/lib/payments/paystack';
import { boardFeeNgn, settleOpenIfPaid, type BoardRequestRow } from '@/lib/board/board';

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
 * POST /api/board/requests/[id]/pay
 * Start the connection-fee checkout for a board request. The
 * payment row is a normal connection_fee row whose target stays
 * NULL until the pick; board_request_id ties it to the request so
 * settlement (verify endpoint, webhook, lazy reads) can open the
 * request. Body: { channel? } ("card" | "bank_transfer").
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    channel?: unknown;
    pay_with_coins?: unknown;
  } | null;
  if (body?.channel !== undefined && !isPaymentChannel(body.channel)) {
    return NextResponse.json(
      { error: 'channel must be "card" or "bank_transfer"' },
      { status: 400 }
    );
  }
  const channel: PaymentChannel | undefined = isPaymentChannel(body?.channel)
    ? body.channel
    : undefined;

  const svc = service();
  const { data: request } = await svc
    .from('board_requests')
    .select('*')
    .eq('id', params.id)
    .eq('client_id', user.id)
    .maybeSingle();
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  const row = request as BoardRequestRow;
  if (row.status !== 'awaiting_payment') {
    return NextResponse.json(
      { error: 'This request is not waiting for payment.' },
      { status: 409 }
    );
  }

  const fee = await boardFeeNgn(svc);

  // Coins rail: spend the fee from the wallet, stamp the reference
  // on the request, and let the shared settler open it (its ledger
  // proof lives in lib/board/board.ts). No gateway involved, so
  // this branch runs before the Paystack configuration gate.
  if (body?.pay_with_coins === true) {
    const feeCoins = Math.ceil(fee / 10);
    const reference = `COINS-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    if (row.payment_ref) {
      await svc
        .from('card_payments')
        .update({ status: 'failed' })
        .eq('reference', row.payment_ref)
        .eq('status', 'pending');
    }
    const { error: spendErr } = await svc.rpc('spend_coins', {
      p_user_id: user.id,
      p_amount: feeCoins,
      p_kind: 'board_fee',
      p_ref: reference,
      p_meta: { board_request_id: row.id },
    });
    if (spendErr) {
      if (String(spendErr.message).includes('insufficient_balance')) {
        return NextResponse.json(
          { error: 'Your wallet does not hold enough coins for the fee. Top up or pay by card.' },
          { status: 402 }
        );
      }
      return NextResponse.json(
        { error: 'We could not take the fee from your wallet. Please try again.' },
        { status: 500 }
      );
    }
    await svc
      .from('board_requests')
      .update({ payment_ref: reference, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    const opened = await settleOpenIfPaid(svc, { ...row, payment_ref: reference });
    return NextResponse.json({ ok: true, reference, opened: opened.status === 'open' });
  }

  const paystackConfig = await resolvePaystackConfig(svc);
  if (!paystackConfiguredFor(paystackConfig)) {
    return NextResponse.json(
      { error: 'Card payments are not switched on yet.' },
      { status: 503 }
    );
  }
  const reference = makeReference();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  // Retire any earlier pending attempt for this request so only
  // the reference stored on the request can ever settle it.
  if (row.payment_ref) {
    await svc
      .from('card_payments')
      .update({ status: 'failed' })
      .eq('reference', row.payment_ref)
      .eq('status', 'pending');
  }

  const { error: insErr } = await svc.from('card_payments').insert({
    user_id: user.id,
    kind: 'connection_fee',
    reference,
    amount_ngn: fee,
    target_provider_id: null,
    status: 'pending',
    board_request_id: row.id,
    service_type: row.service_type,
  });
  if (insErr) {
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 });
  }
  await svc
    .from('board_requests')
    .update({ payment_ref: reference, updated_at: new Date().toISOString() })
    .eq('id', row.id);

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
        board_request_id: row.id,
        custom_fields: [
          { display_name: 'Purpose', variable_name: 'purpose', value: 'Intima request board fee' },
        ],
      },
    }, paystackConfig);
    return NextResponse.json({ authorizationUrl, reference });
  } catch (e) {
    await svc
      .from('card_payments')
      .update({ status: 'failed' })
      .eq('reference', reference);
    return NextResponse.json(
      { error: 'We could not start that payment. Please try again.' },
      { status: 502 }
    );
  }
}
