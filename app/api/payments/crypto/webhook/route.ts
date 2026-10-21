import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { verifyIpnSignature, mapGatewayStatus } from '@/lib/payments/nowpayments';
import { settleConnectionFeePayment } from '@/lib/payments/settleConnection';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface IpnBody {
  payment_id?: string | number;
  payment_status?: string;
  order_id?: string;
  price_amount?: number;
  pay_amount?: number;
  pay_currency?: string;
}

/**
 * POST /api/payments/crypto/webhook
 * NOWPayments IPN callback. Signature-verified (HMAC-SHA512, IPN
 * secret). Idempotent: the transition to finished is claimed with a
 * guarded update (from pending, or from partial after a
 * partially_paid callback), and crediting happens only for the
 * caller that wins the claim, so duplicate callbacks can never
 * double-credit. If crediting itself failed after a claim, a later
 * duplicate callback heals it instead of just acknowledging.
 *
 * Coins: credit the balance + write the coin_topups ledger row, the
 * same shape the bank-transfer matcher writes.
 * Connection fee: the row flips to finished and the connection is
 * created here by the shared settler, so a payer whose browser
 * never returns still gets the connection they paid for. (The
 * crypto create stores no screening answers, so if the companion
 * asks questions the settler steps aside and the browser flow,
 * which collects them, remains the path.)
 */
export async function POST(req: NextRequest) {
  const raw = (await req.json().catch(() => null)) as IpnBody | null;
  if (!raw) return NextResponse.json({ error: 'Bad body' }, { status: 400 });

  const signature = req.headers.get('x-nowpayments-sig');
  if (!verifyIpnSignature(raw, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const reference = raw.order_id;
  const gatewayStatus = raw.payment_status;
  if (!reference || !gatewayStatus) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const next = mapGatewayStatus(gatewayStatus);
  const svc = service();

  const { data: payment } = await svc
    .from('crypto_payments')
    .select('id, user_id, kind, reference, amount_ngn, coins, target_provider_id, status')
    .eq('reference', reference)
    .maybeSingle();
  if (!payment) return NextResponse.json({ error: 'Unknown order' }, { status: 404 });

  if (next === 'finished') {
    // Claim the transition atomically: only one callback wins. The
    // claim must accept 'partial' as well as 'pending': a payment
    // that was partially_paid first still finishes later, and a
    // pending-only claim would strand it unsettled forever.
    const { data: claimed } = await svc
      .from('crypto_payments')
      .update({ status: 'finished', updated_at: new Date().toISOString() })
      .eq('id', payment.id)
      .in('status', ['pending', 'partial'])
      .select('id')
      .maybeSingle();
    if (!claimed) {
      // Already finished by an earlier callback. Normally there is
      // nothing to do, but if that callback claimed the row and then
      // failed before crediting, this retry is the only thing that
      // can still land the coins: heal a missing credit.
      if (payment.status === 'finished' && payment.kind === 'coins' && payment.coins) {
        await creditCoinsIfMissing(svc, payment);
      }
      if (payment.status === 'finished' && payment.kind === 'connection_fee') {
        await settleConnectionFeePayment(svc, 'crypto', payment.reference);
      }
      return NextResponse.json({ ok: true, duplicate: true });
    }

    if (payment.kind === 'coins' && payment.coins) {
      await creditCoins(svc, payment);
    }
    if (payment.kind === 'connection_fee') {
      await settleConnectionFeePayment(svc, 'crypto', payment.reference);
    }
    return NextResponse.json({ ok: true, credited: payment.kind === 'coins' });
  }

  // Non-final states: record progress without crediting. A partial
  // payment can still move on to failed or expired from here.
  if (
    (payment.status === 'pending' || payment.status === 'partial') &&
    next !== 'pending' &&
    next !== payment.status
  ) {
    await svc
      .from('crypto_payments')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', payment.id)
      .eq('status', payment.status);
  }
  return NextResponse.json({ ok: true, status: next });
}

interface CryptoPaymentRow {
  user_id: string;
  reference: string;
  amount_ngn: number;
  coins: number | null;
}

/** Credit a finished coin payment and write its ledger row. */
async function creditCoins(
  svc: ReturnType<typeof service>,
  payment: CryptoPaymentRow
): Promise<void> {
  if (!payment.coins) return;
  const { error: creditErr } = await svc.rpc('credit_coins', {
    p_user_id: payment.user_id,
    p_amount: payment.coins,
    p_kind: 'topup_crypto',
    p_ref: `crypto-${payment.reference}`,
    p_meta: {},
  });
  if (creditErr) throw creditErr;
  await svc.from('coin_topups').insert({
    user_id: payment.user_id,
    reference: `crypto-${payment.reference}`,
    coins: payment.coins,
    amount_ngn: payment.amount_ngn,
  });
}

/**
 * Heal a finished coin payment whose credit never landed (the
 * claiming callback died between the claim and the credit). The
 * coin_topups row is the receipt: without it, credit now. The
 * credit_coins RPC is itself idempotent on (kind, ref), so this
 * can never double-credit.
 */
async function creditCoinsIfMissing(
  svc: ReturnType<typeof service>,
  payment: CryptoPaymentRow
): Promise<void> {
  const { data: existing } = await svc
    .from('coin_topups')
    .select('id')
    .eq('reference', `crypto-${payment.reference}`)
    .maybeSingle();
  if (existing) return;
  await creditCoins(svc, payment);
}
