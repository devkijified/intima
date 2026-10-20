import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/live/token
 * Mints a LiveKit access token. Body: { sessionId, role: 'publisher' | 'viewer' }.
 *
 * - Publisher: must own the live session and be a provider.
 * - Viewer: session must be live; if the session is paid (price_ngn > 0),
 *   the viewer must hold an active paid connection, an effective fan
 *   club subscription with the host (fans enter free), OR be the host.
 * The API secret never leaves the server.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { sessionId, role } = await req.json();
    if (!sessionId || !['publisher', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'sessionId and role required' }, { status: 400 });
    }

    const { data: session } = await supabase
      .from('live_sessions')
      .select('id, provider_id, status, is_public, price_ngn, livekit_room')
      .eq('id', sessionId)
      .single();

    if (!session || session.status !== 'live') {
      return NextResponse.json({ error: 'Stream is not live' }, { status: 404 });
    }

    const roomName = session.livekit_room || `intima-live-${session.id}`;
    const isHost = session.provider_id === user.id;

    if (role === 'publisher') {
      if (!isHost) {
        // An accepted co-host may publish into the host's room.
        const { data: cohost } = await supabase
          .from('live_cohosts')
          .select('id')
          .eq('session_id', sessionId)
          .eq('cohost_id', user.id)
          .eq('status', 'accepted')
          .maybeSingle();
        if (!cohost) {
          return NextResponse.json({ error: 'Only the host can publish' }, { status: 403 });
        }
      }
    } else {
      // Paid room gate: host always in; others need an active
      // connection or an effective fan club subscription with the
      // host. Fans enter free: their subscription already paid the
      // platform its cut, so this check grants the token without
      // charging and without writing any payment rows.
      if (!isHost && !session.is_public && (session.price_ngn ?? 0) > 0) {
        const { data: conn } = await supabase
          .from('connections')
          .select('id')
          .eq('client_id', user.id)
          .eq('provider_id', session.provider_id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        let allowed = !!conn;
        if (!allowed) {
          // Same effectiveness rule as /api/subscriptions: 'active',
          // or 'cancelled' with the paid period still running.
          const { data: subs } = await supabase
            .from('subscriptions')
            .select('status, current_period_end')
            .eq('subscriber_id', user.id)
            .eq('provider_id', session.provider_id)
            .order('created_at', { ascending: false })
            .limit(5);
          const nowMs = Date.now();
          allowed = (subs ?? []).some(
            (s: { status: string; current_period_end: string }) =>
              s.status === 'active' ||
              (s.status === 'cancelled' &&
                new Date(s.current_period_end).getTime() > nowMs)
          );
        }
        if (!allowed) {
          return NextResponse.json({ error: 'This is a paid stream' }, { status: 402 });
        }
      }
    }

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      {
        identity: user.id,
        name: user.id.slice(0, 8),
        ttl: role === 'publisher' ? '4h' : '2h',
      }
    );
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: role === 'publisher',
      canSubscribe: true,
      canPublishData: true,
    });

    return NextResponse.json({
      token: await at.toJwt(),
      url: process.env.LIVEKIT_URL,
      room: roomName,
    });
  } catch (e) {
    console.error('[live/token]', e);
    return NextResponse.json({ error: 'Token mint failed' }, { status: 500 });
  }
}
