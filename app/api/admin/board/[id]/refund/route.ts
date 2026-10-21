import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { attemptRefund, type BoardRequestRow } from '@/lib/board/board';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  return profile?.role === 'admin' || profile?.role === 'super_admin' ? user : null;
}

/**
 * POST /api/admin/board/[id]/refund
 * Retry (or force) the fee refund on an expired or cancelled board
 * request whose refund is pending or failed. Card refunds go
 * through Paystack here; crypto refunds stay manual and this
 * endpoint says so instead of pretending.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 });

  const svc = service();
  const { data: request } = await svc
    .from('board_requests')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  const row = request as BoardRequestRow;
  if (row.status !== 'expired' && row.status !== 'cancelled') {
    return NextResponse.json(
      { error: 'Only expired or cancelled requests carry refunds.' },
      { status: 409 }
    );
  }
  if (row.refund_state === 'refunded') {
    return NextResponse.json({ ok: true, refund_state: 'refunded', already: true });
  }
  if (row.payment_rail !== 'card') {
    return NextResponse.json(
      { error: 'Crypto refunds are manual. Refund from the gateway dashboard, then mark the request in the database.' },
      { status: 422 }
    );
  }
  const state = await attemptRefund(svc, row);
  return NextResponse.json({ ok: true, refund_state: state });
}
