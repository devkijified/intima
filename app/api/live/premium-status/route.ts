import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getPremiumEligibility } from '@/lib/live/premium';

/**
 * GET /api/live/premium-status
 * The caller's Premium (fans only) stream checklist: whether she is
 * eligible, and per check what she has and what is needed. The studio
 * renders it under the Premium access option when it is locked. The
 * same evaluator enforces the bar in the create, schedule, start, and
 * go-live routes, so what she sees here is exactly what the server
 * will judge.
 */
export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role !== 'model') {
      return NextResponse.json(
        { error: 'Only companions have a premium status' },
        { status: 403 }
      );
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const result = await getPremiumEligibility(service, user.id);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[live/premium-status]', e);
    return NextResponse.json(
      { error: 'Could not load premium status' },
      { status: 500 }
    );
  }
}
