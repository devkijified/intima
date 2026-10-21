import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  verifyWebhookSignature,
  settleCoinTopup,
  markCardPaymentPaid,
} from '@/lib/payments/paystack';
import { dvaCreditMath, settleDvaTopup } from '@/lib/payments/dva';
import { settleConnectionFeePayment } from '@/lib/payments/settleConnection';
import { settleOpenIfPaid, type BoardRequestRow } from '@/lib/board/board';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface PaystackEvent {
  event?: string;
  data?: {
    reference?: string;
    amount?: number;
    metadata?: Record<string, unknown>;
    authorization?: { channel?: string; receiver_bank_account_number?: string };
    customer?: { customer_code?: string };
  };
}

/**
 * POST /api/payments/paystack/webhook
 * Set this URL in the Paystack dashboard. Signature-verified with the
 * secret key (HMAC-SHA512 of the raw body). On charge.success it
 * settles server-side so money lands even if the payer closes the tab
 * before the callback: coin top-ups credit through the shared
 * idempotent settler; connection fees flip card_payments to paid; a
 * board fee also opens its request right here, so nothing depends on
 * the payer's browser coming back.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-paystack-signature');
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: PaystackEvent | null = null;
  try {
    event = JSON.parse(rawBody) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: 'Bad body' }, { status: 400 });
  }

  if (event?.event !== 'charge.success' || !event.data?.reference) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const reference = event.data.reference;
  const meta = (event.data.metadata ?? {}) as Record<string, unknown>;
  const svc = service();

  // Dedicated virtual account credits arrive with no app metadata:
  // the money names the account it landed in, so resolve the owner
  // from user_bank_accounts (by account number, then customer code)
  // and credit coins at the DVA rate. This branch must run before
  // the metadata branches below.
  if (event.data.authorization?.channel === 'dedicated_nuban') {
    const accountNumber = event.data.authorization.receiver_bank_account_number;
    const customerCode = event.data.customer?.customer_code;
    let ownerId: string | null = null;
    if (accountNumber) {
      const { data } = await svc
        .from('user_bank_accounts')
        .select('user_id')
        .eq('account_number', accountNumber)
        .maybeSingle();
      ownerId = data?.user_id ?? null;
    }
    if (!ownerId && customerCode) {
      const { data } = await svc
        .from('user_bank_accounts')
        .select('user_id')
        .eq('paystack_customer_code', customerCode)
        .maybeSingle();
      ownerId = data?.user_id ?? null;
    }
    if (!ownerId) {
      return NextResponse.json({ ok: true, ignored: 'dva_unknown_account' });
    }
    const amountNgn = Math.round((event.data.amount ?? 0) / 100);
    const { coins, belowMinimum } = dvaCreditMath(amountNgn);
    if (belowMinimum || coins <= 0) {
      return NextResponse.json({ ok: true, ignored: 'dva_below_minimum' });
    }
    await settleDvaTopup(svc, { reference, userId: ownerId, coins, amountNgn });
    return NextResponse.json({ ok: true, settled: 'dva' });
  }

  // Coin top-ups carry coins + user_id in metadata.
  const coins = Number(meta.coins);
  const userId = typeof meta.user_id === 'string' ? meta.user_id : null;
  if (userId && Number.isFinite(coins) && coins > 0) {
    await settleCoinTopup(svc, {
      reference,
      userId,
      coins,
      amountNgn: Math.round((event.data.amount ?? 0) / 100),
    });
    return NextResponse.json({ ok: true, settled: 'coins' });
  }

  // Connection fees settle by flipping the payment row, and the
  // connection itself is created here too: a board fee opens its
  // request, a companion fee opens the connection, so neither
  // depends on the payer's browser coming back.
  if (meta.kind === 'connection_fee') {
    await markCardPaymentPaid(svc, reference);
    await openBoardRequestIfAny(svc, reference);
    await settleConnectionFeePayment(svc, 'card', reference);
    return NextResponse.json({ ok: true, settled: 'connection_fee' });
  }

  return NextResponse.json({ ok: true, ignored: true });
}

/**
 * A board fee names no companion: settlement opens the request on
 * the board instead of creating a connection. This mirrors the
 * verify endpoint so the webhook alone is sufficient when the
 * payer's browser never returns. settleOpenIfPaid is guarded (the
 * request must still be awaiting_payment and its stored payment_ref
 * must be the settled one), so duplicate webhooks are harmless.
 */
async function openBoardRequestIfAny(
  svc: ReturnType<typeof service>,
  reference: string
): Promise<void> {
  const { data: row } = await svc
    .from('card_payments')
    .select('board_request_id')
    .eq('reference', reference)
    .maybeSingle();
  if (!row?.board_request_id) return;
  const { data: request } = await svc
    .from('board_requests')
    .select('*')
    .eq('id', row.board_request_id)
    .maybeSingle();
  if (request) {
    await settleOpenIfPaid(svc, request as BoardRequestRow).catch(() => {});
  }
}
