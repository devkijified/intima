import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  settleOpenIfPaid,
  attemptRefund,
  type BoardRequestRow,
} from '@/lib/board/board';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/board/requests/[id]/cancel
 * The client cancels an unpaid or open request. A paid fee goes
 * back through the original rail (the same refund path expiry
 * uses); an unpaid one simply closes.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const svc = service();
  const { data: requestRaw } = await svc
    .from('board_requests')
    .select('*')
    .eq('id', params.id)
    .eq('client_id', user.id)
    .maybeSingle();
  if (!requestRaw) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  let request = await settleOpenIfPaid(svc, requestRaw as BoardRequestRow);
  if (request.status !== 'awaiting_payment' && request.status !== 'open') {
    return NextResponse.json(
      { error: 'This request can no longer be cancelled.' },
      { status: 409 }
    );
  }

  const { data: updated } = await svc
    .from('board_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', request.id)
    .in('status', ['awaiting_payment', 'open'])
    .select('*')
    .maybeSingle();
  if (!updated) {
    return NextResponse.json({ error: 'This request can no longer be cancelled.' }, { status: 409 });
  }
  const row = updated as BoardRequestRow;
  // Only a settled fee has money to give back.
  let refund: string | null = null;
  if (row.payment_ref && row.status === 'cancelled') {
    const { data: card } = await svc
      .from('card_payments')
      .select('status')
      .eq('reference', row.payment_ref)
      .eq('board_request_id', row.id)
      .maybeSingle();
    const { data: crypto } = !card
      ? await svc
          .from('crypto_payments')
          .select('status')
          .eq('reference', row.payment_ref)
          .eq('board_request_id', row.id)
          .maybeSingle()
      : { data: null };
    if (card?.status === 'paid' || crypto?.status === 'finished') {
      if (!row.payment_rail) {
        await svc
          .from('board_requests')
          .update({ payment_rail: card ? 'card' : 'crypto' })
          .eq('id', row.id);
        row.payment_rail = card ? 'card' : 'crypto';
      }
      refund = await attemptRefund(svc, row);
    }
  }
  return NextResponse.json({ success: true, refund_state: refund });
}
