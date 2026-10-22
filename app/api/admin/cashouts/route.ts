import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { notifyUsers } from '@/lib/push-server';

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  return profile?.role === 'admin' || profile?.role === 'super_admin' ? user : null;
}

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/admin/cashouts?status=pending: list requests for review.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const status = req.nextUrl.searchParams.get('status') ?? 'pending';
  const { data } = await service()
    .from('cashout_requests')
    .select('id, coins, amount_ngn, bank_name, account_number, account_name, status, created_at, user_id, profiles!inner(display_name)')
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(50);

  return NextResponse.json({ requests: data ?? [] });
}

/**
 * POST /api/admin/cashouts
 * Body: { id, action: 'approve' | 'pay' | 'reject', note? }
 * - approve: pending → approved (you've verified the bank details)
 * - pay: approved → paid (you've sent the bank transfer)
 * - reject: pending → rejected (coins refunded to the companion)
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== 'string' || typeof body.action !== 'string') {
    return NextResponse.json({ error: 'id and action are required' }, { status: 400 });
  }
  const { id, action, note } = body as { id: string; action: string; note?: string };
  const svc = service();

  const { data: request } = await svc
    .from('cashout_requests')
    .select('id, user_id, coins, amount_ngn, status')
    .eq('id', id)
    .single();
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'approve' && request.status === 'pending') {
    await svc.from('cashout_requests').update({ status: 'approved', admin_note: note ?? null })
      .eq('id', id);
  } else if (action === 'pay' && request.status === 'approved') {
    await svc.from('cashout_requests').update({
      status: 'paid', admin_note: note ?? null, processed_at: new Date().toISOString(),
    }).eq('id', id);
  } else if (action === 'reject' && request.status === 'pending') {
    // Refund the held coins via the ledger.
    const { error: creditErr } = await svc.rpc('credit_coins', {
      p_user_id: request.user_id,
      p_amount: request.coins,
      p_kind: 'cashout_refund',
      p_ref: id,
      p_meta: {},
    });
    if (creditErr) {
      console.error('[admin/cashouts] refund credit failed:', creditErr);
      return NextResponse.json({ error: 'The coin refund failed, so the request was not rejected. Please try again.' }, { status: 502 });
    }
    await svc.from('cashout_requests').update({
      status: 'rejected', admin_note: note ?? null, processed_at: new Date().toISOString(),
    }).eq('id', id);
  } else {
    return NextResponse.json({ error: 'Invalid action for current status' }, { status: 400 });
  }

  // Tell the companion the decision (bell row plus push, and email
  // for these money types). Best effort: the decision already landed.
  const amount = request.amount_ngn
    ? ` (₦${Number(request.amount_ngn).toLocaleString()})`
    : '';
  const decision =
    action === 'approve'
      ? {
          type: 'cashout_approved',
          title: 'Cash-out approved',
          body: `Your cash-out of ${request.coins} coins${amount} has been approved. The bank transfer follows shortly.`,
        }
      : action === 'pay'
        ? {
            type: 'cashout_paid',
            title: 'Cash-out paid',
            body: `Your cash-out of ${request.coins} coins${amount} has been paid to your bank account.`,
          }
        : {
            type: 'cashout_rejected',
            title: 'Cash-out rejected',
            body: note
              ? `Your cash-out of ${request.coins} coins${amount} was rejected and the coins are back in your wallet. Reason: ${note}`
              : `Your cash-out of ${request.coins} coins${amount} was rejected and the coins are back in your wallet.`,
          };
  await notifyUsers({
    userIds: [request.user_id],
    ...decision,
    link: '/wallet',
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
