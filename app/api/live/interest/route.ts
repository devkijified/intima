import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/live/interest
 * Toggles the caller's "Notify me" interest in a scheduled stream.
 * Body: { sessionId }. Returns { interested, count } after the toggle.
 * Auth required. The session must exist and still be scheduled; RLS
 * on live_interests limits writes to the caller's own rows.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { sessionId } = await req.json();
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const { data: session } = await supabase
      .from('live_sessions')
      .select('id, status')
      .eq('id', sessionId)
      .maybeSingle();
    if (!session) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }
    if (session.status !== 'scheduled') {
      return NextResponse.json({ error: 'This stream is no longer scheduled' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('live_interests')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();

    let interested: boolean;
    if (existing) {
      const { error } = await supabase
        .from('live_interests')
        .delete()
        .eq('session_id', sessionId)
        .eq('user_id', user.id);
      if (error) throw error;
      interested = false;
    } else {
      const { error } = await supabase
        .from('live_interests')
        .insert({ session_id: sessionId, user_id: user.id });
      if (error) throw error;
      interested = true;
    }

    const { count } = await supabase
      .from('live_interests')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    return NextResponse.json({ interested, count: count ?? 0 });
  } catch (e) {
    console.error('[live/interest]', e);
    return NextResponse.json({ error: 'Could not update notification' }, { status: 500 });
  }
}
