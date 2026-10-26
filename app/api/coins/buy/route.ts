import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { COIN_PACKAGES } from '@/lib/coins/packages';
import {
  isPaymentChannel,
  resolvePaystackConfig,
  type PaymentChannel,
} from '@/lib/payments/paystack';

/**
 * POST /api/coins/buy
 * Initializes a Paystack transaction for a coin package.
 * Body: { packageId, channel? } where channel is "card" or
 * "bank_transfer". Transfer shows the buyer a dedicated account
 * number on the checkout; coins settle through the same webhook
 * when Paystack confirms the transfer.
 * Returns { authorizationUrl, reference }.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { packageId, channel: rawChannel } = await req.json();
    const pkg = COIN_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      return NextResponse.json({ error: 'Invalid package' }, { status: 400 });
    }
    if (rawChannel !== undefined && !isPaymentChannel(rawChannel)) {
      return NextResponse.json(
        { error: 'channel must be "card" or "bank_transfer"' },
        { status: 400 }
      );
    }
    const channel: PaymentChannel | undefined = isPaymentChannel(rawChannel)
      ? rawChannel
      : undefined;

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { secretKey: secret } = await resolvePaystackConfig(service);
    if (!secret) {
      return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    const reference = `intima-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const appUrl = new URL(req.url).origin;

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email ?? `${user.id}@intima.user`,
        amount: pkg.priceNgn * 100, // kobo
        reference,
        // Explicit choice pins the checkout to that one channel; no
        // choice sends no channels field, the long-standing default.
        ...(channel ? { channels: [channel] } : {}),
        callback_url: `${appUrl}/coins/callback`,
        metadata: {
          user_id: user.id,
          package_id: pkg.id,
          coins: pkg.coins,
          display_name: profile?.display_name ?? 'Intima user',
        },
      }),
    });

    const data = await res.json();
    if (!data.status) {
      console.error('[coins/buy] paystack error', data);
      return NextResponse.json({ error: 'Payment initialization failed' }, { status: 502 });
    }

    return NextResponse.json({
      authorizationUrl: data.data.authorization_url,
      reference,
    });
  } catch (e) {
    console.error('[coins/buy]', e);
    return NextResponse.json({ error: 'Failed to start payment' }, { status: 500 });
  }
}
