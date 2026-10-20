import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * POST /api/live/schedule
 * A provider creates a scheduled stream. Body: { title, scheduledFor,
 * priceNgn?, isPublic? }. The session is inserted with status
 * 'scheduled' and a pre-generated LiveKit room name matching the token
 * route convention, intima-live-<session id>. Going live later flips
 * the status through POST /api/live/go-live.
 */
export async function POST(req: NextRequest) {
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
      return NextResponse.json({ error: 'Only companions can schedule streams' }, { status: 403 });
    }

    const { title, scheduledFor, priceNgn, isPublic } = await req.json();
    const when = typeof scheduledFor === 'string' ? new Date(scheduledFor) : null;
    if (!when || Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: 'scheduledFor must be a valid date' }, { status: 400 });
    }
    if (when.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Pick a time in the future' }, { status: 400 });
    }
    const price = Math.max(0, Math.round(Number(priceNgn ?? 0)) || 0);

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: session, error } = await service
      .from('live_sessions')
      .insert({
        provider_id: user.id,
        title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 80) : 'Live',
        is_public: isPublic === undefined ? price === 0 : !!isPublic,
        price_ngn: price,
        status: 'scheduled',
        scheduled_for: when.toISOString(),
      })
      .select('id, title, scheduled_for, price_ngn')
      .single();
    if (error) throw error;

    // Pre-generate the room name now so every later step can rely on it.
    const room = `intima-live-${session.id}`;
    await service.from('live_sessions').update({ livekit_room: room }).eq('id', session.id);

    return NextResponse.json({ ok: true, session: { ...session, livekit_room: room } });
  } catch (e) {
    console.error('[live/schedule]', e);
    return NextResponse.json({ error: 'Could not schedule stream' }, { status: 500 });
  }
}
