import { NextResponse } from 'next/server';
import { paystackConfigured, paystackTestMode } from '@/lib/payments/paystack';

/**
 * GET /api/coins/methods: which top-up rails are live.
 * Card and bank transfer are both channels on the same Paystack
 * account, so they switch on and off together with
 * PAYSTACK_SECRET_KEY. (transfer previously reported the old custom
 * bank-alert flow; it now means the Paystack transfer channel.)
 * testMode tells client surfaces whether to show test-mode wording:
 * true while the key is a test key, and true when no key is set at
 * all (the app then runs on the simulated provider). It flips to
 * false by itself the moment a live key is deployed, no code change.
 */
export async function GET() {
  const paystack = paystackConfigured();
  return NextResponse.json({
    card: paystack,
    transfer: paystack,
    testMode: paystack ? paystackTestMode() : true,
  });
}
