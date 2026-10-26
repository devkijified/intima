import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { paystackConfiguredFor, resolvePaystackConfig } from '@/lib/payments/paystack';

export const dynamic = 'force-dynamic';

/**
 * GET /api/coins/methods: which top-up rails are live.
 * Card and bank transfer are both channels on the same Paystack
 * account, so they switch on and off together with the active
 * mode's secret key (Admin, Settings holds the Test / Live switch;
 * the test set falls back to PAYSTACK_SECRET_KEY). (transfer
 * previously reported the old custom bank-alert flow; it now means
 * the Paystack transfer channel.)
 * testMode tells client surfaces whether to show test-mode wording:
 * true while the active key is a test key, and true when no key is
 * set at all (the app then runs on the simulated provider). It
 * flips to false by itself the moment the switch points at a live
 * key, no code change.
 */
export async function GET() {
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const config = await resolvePaystackConfig(service);
  const paystack = paystackConfiguredFor(config);
  return NextResponse.json({
    card: paystack,
    transfer: paystack,
    testMode: paystack ? config.secretKey.startsWith('sk_test_') : true,
  });
}
