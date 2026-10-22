import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  loadHeldFee,
  feeConsumed,
  attemptFeeRefund,
} from '@/lib/payments/heldFee';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/connections/fee-refund
 * The client's exit from a held fee: refund refund_pct of it
 * (85 percent; the platform keeps the processing share, per the
 * published refund policy) through the rail it was paid on. Card
 * refunds go through Paystack and may land as pending; crypto
 * refunds are manual and park at pending for an admin. A fee a
 * connection has consumed can never be refunded here.
 * Body: { payment_ref }
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    payment_ref?: string;
  } | null;
  if (!body?.payment_ref) {
    return NextResponse.json({ error: 'payment_ref is required' }, { status: 400 });
  }

  const svc = service();
  const fee = await loadHeldFee(svc, body.payment_ref);
  if (!fee || fee.userId !== user.id) {
    return NextResponse.json(
      { error: 'We could not find a settled connection fee with that reference.' },
      { status: 404 }
    );
  }
  if (fee.disposition === 'applied' || (await feeConsumed(svc, fee.reference))) {
    return NextResponse.json(
      { error: 'This fee already opened a connection, so it can no longer be refunded from here. If something went wrong with that connection, open a dispute from the chat instead.' },
      { status: 409 }
    );
  }

  const outcome = await attemptFeeRefund(svc, fee);
  if (outcome.state === 'refund_failed') {
    return NextResponse.json(
      {
        error:
          'The refund did not go through at the payment provider. Your fee is still held and safe: try again, or contact support and we will sort it.',
        state: outcome.state,
        refundAmountNgn: outcome.refundAmountNgn,
        pct: outcome.pct,
      },
      { status: 502 }
    );
  }
  return NextResponse.json({
    success: true,
    state: outcome.state,
    refundAmountNgn: outcome.refundAmountNgn,
    pct: outcome.pct,
  });
}
