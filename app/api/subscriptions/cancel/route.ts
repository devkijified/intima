import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * POST /api/subscriptions/cancel { provider_id }
 * Cancels the caller's subscription to that provider. Access runs
 * until current_period_end (the paid period is kept); the renewal
 * cron only charges rows with status 'active', so a cancelled row
 * is never charged again.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { provider_id: providerId } = await req.json().catch(() => ({}));
    if (!providerId || typeof providerId !== 'string') {
      return NextResponse.json({ error: 'provider_id required' }, { status: 400 });
    }

    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: rows } = await svc
      .from('subscriptions')
      .select('id, status, current_period_end')
      .eq('subscriber_id', user.id)
      .eq('provider_id', providerId)
      .in('status', ['active', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(1);
    const row = rows?.[0];
    if (!row) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }
    if (row.status === 'cancelled') {
      return NextResponse.json({
        ok: true,
        alreadyCancelled: true,
        current_period_end: row.current_period_end,
      });
    }

    const { error } = await svc
      .from('subscriptions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'active');
    if (error) throw error;

    return NextResponse.json({ ok: true, current_period_end: row.current_period_end });
  } catch (e) {
    console.error('[subscriptions/cancel]', e);
    return NextResponse.json({ error: 'Cancel failed' }, { status: 500 });
  }
}
