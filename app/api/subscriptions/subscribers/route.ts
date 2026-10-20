import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * GET /api/subscriptions/subscribers?provider_id=
 * The user ids with an effective subscription to that provider:
 * status 'active', or 'cancelled' with current_period_end still in
 * the future. Used to render fan badges in live chat and threads.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const providerId = req.nextUrl.searchParams.get('provider_id');
    if (!providerId) {
      return NextResponse.json({ error: 'provider_id required' }, { status: 400 });
    }

    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: rows } = await svc
      .from('subscriptions')
      .select('subscriber_id, status, current_period_end')
      .eq('provider_id', providerId)
      .in('status', ['active', 'cancelled']);

    const now = Date.now();
    const ids = new Set<string>();
    for (const r of rows ?? []) {
      if (
        r.status === 'active' ||
        (r.status === 'cancelled' && new Date(r.current_period_end).getTime() > now)
      ) {
        ids.add(r.subscriber_id as string);
      }
    }
    return NextResponse.json({ subscriberIds: [...ids] });
  } catch (e) {
    console.error('[subscriptions/subscribers]', e);
    return NextResponse.json({ error: 'Could not load subscribers' }, { status: 500 });
  }
}
