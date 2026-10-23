import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/test-connection  { providerId }
 *
 * Admin-only: open (or reuse) a real chat thread between the
 * signed-in admin and a companion, so the team can test the
 * messaging experience first-hand: the composer, media, the
 * gallery, PPV states, all of it, through the exact code paths
 * real users get.
 *
 * The thread is a genuine connection row with the admin as the
 * client, marked payment_ref 'admin-test' with a zero fee: no
 * payment record is faked, and the row is recognisable in the
 * data forever. Regular users can never reach this route, so
 * the connection fee fence for real clients is untouched.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { providerId } = (await req.json().catch(() => ({}))) as {
    providerId?: string;
  };
  if (!providerId || providerId === user.id) {
    return NextResponse.json({ error: 'providerId required' }, { status: 400 });
  }
  const { data: provider } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', providerId)
    .maybeSingle();
  if (!provider || provider.role !== 'model') {
    return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
  }

  // One active connection per pair: reuse the live one if the
  // admin already has a thread (test or real) with her.
  const { data: existing } = await supabase
    .from('connections')
    .select('id')
    .eq('client_id', user.id)
    .eq('provider_id', providerId)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ connectionId: existing.id, reused: true });
  }

  const { data: created, error } = await supabase
    .from('connections')
    .insert({
      client_id: user.id,
      provider_id: providerId,
      fee_ngn: 0,
      status: 'active',
      payment_ref: 'admin-test',
    })
    .select('id')
    .single();
  if (error || !created) {
    return NextResponse.json(
      { error: 'Could not open the test chat. Please try again.' },
      { status: 500 }
    );
  }
  return NextResponse.json({ connectionId: created.id, reused: false });
}
