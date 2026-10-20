import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  verifyWebhookSignature,
  settleCoinTopup,
  markCardPaymentPaid,
} from '@/lib/payments/paystack';

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
  };
}

/**
 * POST /api/payments/paystack/webhook
 * Set this URL in the Paystack dashboard. Signature-verified with the
 * secret key (HMAC-SHA512 of the raw body). On charge.success it
 * settles server-side so money lands even if the payer closes the tab
 * before the callback: coin top-ups credit through the shared
 * idempotent settler; connection fees flip card_payments to paid.
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

  // Connection fees settle by flipping the payment row.
  if (meta.kind === 'connection_fee') {
    await markCardPaymentPaid(svc, reference);
    return NextResponse.json({ ok: true, settled: 'connection_fee' });
  }

  return NextResponse.json({ ok: true, ignored: true });
}
