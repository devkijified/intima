import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

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
 * GET /api/admin/cashouts?status=pending — list requests for review.
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

  const { id, action, note } = await req.json();
  const svc = service();

  const { data: request } = await svc
    .from('cashout_requests')
    .select('id, user_id, coins, status')
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
    // Refund the held coins.
    const { data: bal } = await svc.from('coin_balances')
      .select('balance').eq('user_id', request.user_id).maybeSingle();
    await svc.from('coin_balances').upsert(
      {
        user_id: request.user_id,
        balance: (bal?.balance ?? 0) + request.coins,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    await svc.from('cashout_requests').update({
      status: 'rejected', admin_note: note ?? null, processed_at: new Date().toISOString(),
    }).eq('id', id);
  } else {
    return NextResponse.json({ error: 'Invalid action for current status' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
