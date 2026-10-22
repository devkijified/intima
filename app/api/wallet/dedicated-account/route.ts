import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { paystackConfigured } from '@/lib/payments/paystack';
import {
  getOrCreateUserDedicatedAccount,
  DvaNotEnabledError,
} from '@/lib/payments/dva';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/wallet/dedicated-account
 * The caller's permanent personal Naira account number (Paystack
 * DVA). Created on first call and returned from storage afterwards.
 * When dedicated accounts are not enabled on the merchant account
 * this answers 200 { enabled: false } so the coins page can fall
 * back to the per-transaction bank transfer channel quietly;
 * genuine failures surface as 502 with Paystack's message.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  if (!paystackConfigured()) {
    return NextResponse.json({ enabled: false });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, display_name, phone')
    .eq('id', user.id)
    .maybeSingle();

  const fullName =
    profile?.full_name ||
    profile?.display_name ||
    (user.email ? user.email.split('@')[0] : 'Intima User');

  try {
    const account = await getOrCreateUserDedicatedAccount(service(), {
      id: user.id,
      email: user.email ?? '',
      fullName,
      phone: profile?.phone ?? null,
    });
    return NextResponse.json({
      enabled: true,
      accountNumber: account.account_number,
      bankName: account.bank_name,
      accountName: account.account_name,
    });
  } catch (err) {
    if (err instanceof DvaNotEnabledError) {
      return NextResponse.json({ enabled: false });
    }
    // Never hand the raw gateway message to the client (house rule:
    // users see human sentences); the detail stays in the server log.
    console.error('[dedicated-account] DVA error:', err);
    return NextResponse.json(
      { error: 'We could not get your account number right now. Please try again in a moment.' },
      { status: 502 },
    );
  }
}
