import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notifyUsers } from '@/lib/push-server';
import { getPremiumEligibility, unmetChecks } from '@/lib/live/premium';

/**
 * POST /api/live/go-live
 * Flips one of the caller's scheduled sessions to live and fans out the
 * same live_started notification the immediate go-live flow sends from
 * the host studio: active connections plus broadcast followers, through
 * the shared notifyUsers primitive (notification rows plus Web Push).
 * Body: { sessionId }. Idempotent: an already live session returns ok.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: session } = await service
      .from('live_sessions')
      .select('id, provider_id, status, title, price_ngn, access_mode')
      .eq('id', sessionId)
      .single();
    if (!session) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }
    if (session.provider_id !== user.id) {
      return NextResponse.json({ error: 'Only the host can go live' }, { status: 403 });
    }
    if (session.status === 'live') {
      return NextResponse.json({ ok: true, alreadyLive: true });
    }
    if (session.status !== 'scheduled') {
      return NextResponse.json({ error: 'This stream cannot go live' }, { status: 400 });
    }

    // A fans (Premium) stream was checked when it was scheduled, but
    // the bar is judged again at the door: if she no longer clears it
    // (for example her account was hidden), it cannot start as fans.
    if (session.access_mode === 'fans') {
      const result = await getPremiumEligibility(service, user.id);
      if (!result.eligible) {
        return NextResponse.json(
          {
            error: 'Premium streams are not unlocked yet',
            checks: unmetChecks(result),
          },
          { status: 403 }
        );
      }
    }

    const { error } = await service
      .from('live_sessions')
      .update({ status: 'live', started_at: new Date().toISOString() })
      .eq('id', sessionId);
    if (error) throw error;

    // Fanout: the same audience as the immediate flow (active
    // connections), widened with broadcast followers.
    const [{ data: conns }, { data: follows }, { data: host }] = await Promise.all([
      service
        .from('connections')
        .select('client_id')
        .eq('provider_id', user.id)
        .eq('status', 'active'),
      service.from('broadcast_follows').select('follower_id').eq('provider_id', user.id),
      service.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
    ]);
    const ids = [...new Set([
      ...(conns ?? []).map((c: { client_id: string }) => c.client_id),
      ...(follows ?? []).map((f: { follower_id: string }) => f.follower_id),
    ])].filter((x) => x !== user.id);

    if (ids.length > 0) {
      await notifyUsers({
        userIds: ids,
        type: 'live_started',
        title: `${host?.display_name ?? 'A companion'} is live`,
        body:
          session.access_mode === 'fans'
            ? `${session.title}. Fans only: join her fan club to watch.`
            : (session.price_ngn ?? 0) > 0
              ? `${session.title}. Join for N${(session.price_ngn ?? 0).toLocaleString()}`
              : `${session.title}. Join free now`,
        link: `/live/${sessionId}`,
      });
    }

    // "Notify me" audience: everyone who tapped Notify me on this
    // scheduled stream, minus anyone already notified above and the
    // host, so nobody receives the alert twice.
    const { data: interests } = await service
      .from('live_interests')
      .select('user_id')
      .eq('session_id', sessionId);
    const alreadyNotified = new Set([...ids, user.id]);
    const interestIds = [
      ...new Set((interests ?? []).map((r: { user_id: string }) => r.user_id)),
    ].filter((id) => !alreadyNotified.has(id));

    if (interestIds.length > 0) {
      await notifyUsers({
        userIds: interestIds,
        type: 'live_started',
        title: `${host?.display_name ?? 'A companion'} is live now`,
        body: session.title,
        link: `/live/${sessionId}`,
      });
    }

    return NextResponse.json({ ok: true, notified: ids.length + interestIds.length });
  } catch (e) {
    console.error('[live/go-live]', e);
    return NextResponse.json({ error: 'Could not go live' }, { status: 500 });
  }
}
