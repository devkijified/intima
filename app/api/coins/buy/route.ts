import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

import { COIN_PACKAGES } from '@/lib/coins/packages';

/**
 * POST /api/coins/buy
 * Initializes a Paystack transaction for a coin package.
 * Body: { packageId }. Returns { authorizationUrl, reference }.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { packageId } = await req.json();
    const pkg = COIN_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      return NextResponse.json({ error: 'Invalid package' }, { status: 400 });
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    const reference = `intima-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://intima-snowy.vercel.app';

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
