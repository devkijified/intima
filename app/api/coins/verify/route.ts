import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * GET /api/coins/verify?reference=...
 * Verifies a Paystack transaction and credits coins.
 * Called from the /coins/callback page after Paystack redirects back.
 * Idempotent: skips if the reference was already credited.
 */
export async function GET(req: NextRequest) {
  try {
    const reference = req.nextUrl.searchParams.get('reference');
    if (!reference) {
      return NextResponse.json({ error: 'Missing reference' }, { status: 400 });
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Idempotency: have we already credited this reference?
    const { data: existing } = await service
      .from('coin_topups')
      .select('id')
      .eq('reference', reference)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ success: true, alreadyCredited: true });
    }

    // Verify with Paystack.
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    const data = await res.json();
    if (!data.status || data.data.status !== 'success') {
      return NextResponse.json({ error: 'Payment not successful' }, { status: 402 });
    }

    const meta = data.data.metadata ?? {};
    const userId = meta.user_id as string;
    const coins = Number(meta.coins);
    if (!userId || !Number.isFinite(coins) || coins <= 0) {
      return NextResponse.json({ error: 'Invalid transaction metadata' }, { status: 400 });
    }

    const { settleCoinTopup } = await import('@/lib/payments/paystack');
    await settleCoinTopup(service, {
      reference,
      userId,
      coins,
      amountNgn: Math.round(data.data.amount / 100),
    });

    return NextResponse.json({ success: true, coins });
  } catch (e) {
    console.error('[coins/verify]', e);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
