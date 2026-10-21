import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  paystackConfigured,
  verifyTransaction,
  markCardPaymentPaid,
} from '@/lib/payments/paystack';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/payments/paystack/verify?reference=CARD-XXXXXX
 * Confirms a connection-fee card payment with Paystack and flips the
 * card_payments row to paid. The callback page calls this, then
 * creates the connection through POST /api/connections. When the
 * payment is paid, the screening answers and service pick stored on
 * the row at initialize time come back with it (intakeAnswers,
 * serviceType), so the callback does not depend on the client's
 * sessionStorage surviving the redirect.
 */
export async function GET(req: NextRequest) {
  if (!paystackConfigured()) {
    return NextResponse.json(
      { error: 'Card payments are not switched on yet.' },
      { status: 503 }
    );
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const reference = req.nextUrl.searchParams.get('reference');
  if (!reference) {
    return NextResponse.json({ error: 'reference is required' }, { status: 400 });
  }

  const svc = service();
  const { data: row } = await svc
    .from('card_payments')
    .select('id, user_id, kind, reference, amount_ngn, target_provider_id, status, intake_answers, service_type')
    .eq('reference', reference)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

  if (row.status === 'paid') {
    return NextResponse.json({ paid: true, alreadyPaid: true, ...publicRow(row) });
  }

  const tx = await verifyTransaction(reference);
  if (tx.status !== 'success') {
    return NextResponse.json({ paid: false, status: tx.status });
  }
  if (tx.amountNgn < row.amount_ngn) {
    return NextResponse.json(
      { error: 'Amount paid does not match the fee' },
      { status: 402 }
    );
  }

  await markCardPaymentPaid(svc, reference);
  return NextResponse.json({ paid: true, ...publicRow(row) });
}

function publicRow(row: {
  kind: string;
  reference: string;
  amount_ngn: number;
  target_provider_id: string | null;
  intake_answers?: unknown;
  service_type?: string | null;
}) {
  return {
    kind: row.kind,
    reference: row.reference,
    amountNgn: row.amount_ngn,
    targetProviderId: row.target_provider_id,
    intakeAnswers: Array.isArray(row.intake_answers) ? row.intake_answers : null,
    serviceType: row.service_type ?? null,
  };
}
