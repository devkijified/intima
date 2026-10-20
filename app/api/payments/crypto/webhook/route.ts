import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { verifyIpnSignature, mapGatewayStatus } from '@/lib/payments/nowpayments';

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
 * secret). Idempotent: the pending->finished transition is claimed
 * with a guarded update, and crediting happens only for the caller
 * that wins the claim, so duplicate callbacks can never double-credit.
 *
 * Coins: credit the balance + write the coin_topups ledger row, the
 * same shape the bank-transfer matcher writes.
 * Connection fee: the row flips to finished; the booking modal polls
 * /api/payments/crypto/status and then creates the connection.
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
    // Claim the transition atomically: only one callback wins.
    const { data: claimed } = await svc
      .from('crypto_payments')
      .update({ status: 'finished', updated_at: new Date().toISOString() })
      .eq('id', payment.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (!claimed) {
      // Already processed by an earlier callback: acknowledge, do nothing.
      return NextResponse.json({ ok: true, duplicate: true });
    }

    if (payment.kind === 'coins' && payment.coins) {
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
    return NextResponse.json({ ok: true, credited: payment.kind === 'coins' });
  }

  // Non-final states: record progress without crediting.
  if (payment.status === 'pending' && next !== 'pending') {
    await svc
      .from('crypto_payments')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', payment.id)
      .eq('status', 'pending');
  }
  return NextResponse.json({ ok: true, status: next });
}
