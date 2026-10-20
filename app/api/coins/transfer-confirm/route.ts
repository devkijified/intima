import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * POST /api/coins/transfer-confirm
 * Called by the email poller when a UBA credit alert matches a pending intent.
 * Body: { reference, amountNgn, alertId }: alertId for idempotency/dedup.
 *
 * Matches a pending, unexpired intent by reference (case-insensitive) and
 * exact amount, then credits the coins. Safe to call repeatedly.
 */
export async function POST(req: NextRequest) {
  try {
    // Shared secret so only our poller can call this.
    const secret = req.headers.get('x-poller-secret');
    if (!secret || secret !== process.env.TRANSFER_POLLER_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { reference, amountNgn, alertId } = await req.json();
    if (!reference || !Number.isFinite(Number(amountNgn))) {
      return NextResponse.json({ error: 'reference and amountNgn required' }, { status: 400 });
    }

    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const ref = String(reference).toUpperCase().trim();
    const amount = Math.round(Number(amountNgn));

    // Find the matching pending intent.
    const { data: intent } = await svc
      .from('transfer_intents')
      .select('id, user_id, coins, amount_ngn, status, expires_at')
      .eq('reference', ref)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (!intent) {
      return NextResponse.json({ matched: false, reason: 'no pending intent for reference' });
    }
    if (intent.amount_ngn !== amount) {
      return NextResponse.json({
        matched: false,
        reason: `amount mismatch: expected ${intent.amount_ngn}, got ${amount}`,
      });
    }

    // Atomic status flip: only the first caller wins. Concurrent poller
    // runs see status != 'pending' and back off, so no double-credit.
    const { data: flipped } = await svc
      .from('transfer_intents')
      .update({ status: 'credited', credited_at: new Date().toISOString() })
      .eq('id', intent.id)
      .eq('status', 'pending')
      .select('id');
    if (!flipped || flipped.length === 0) {
      return NextResponse.json({ matched: false, reason: 'already handled' });
    }

    // Credit the coins via the ledger. The ledger ref stays stable
    // (no alertId suffix) so a repeat confirm for the same intent can
    // never double credit.
    const { error: creditErr } = await svc.rpc('credit_coins', {
      p_user_id: intent.user_id,
      p_amount: intent.coins,
      p_kind: 'topup_transfer',
      p_ref: `transfer-${ref}`,
      p_meta: {},
    });
    if (creditErr) throw creditErr;

    await svc.from('coin_topups').insert({
      user_id: intent.user_id,
      reference: `transfer-${ref}${alertId ? `-${alertId}` : ''}`,
      coins: intent.coins,
      amount_ngn: intent.amount_ngn,
    });

    return NextResponse.json({ matched: true, coins: intent.coins, userId: intent.user_id });
  } catch (e) {
    console.error('[transfer-confirm]', e);
    return NextResponse.json({ error: 'Confirmation failed' }, { status: 500 });
  }
}
