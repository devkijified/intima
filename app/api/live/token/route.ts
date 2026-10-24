import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/live/token
 * Mints a LiveKit access token. Body: { sessionId, role: 'publisher' | 'viewer' }.
 *
 * - Publisher: must own the live session and be a provider, or be an
 *   accepted co-host.
 * - Viewer: session must be live, then the access mode decides:
 *   - fans (Premium): only the host, an accepted co-host, an appointed
 *     moderator, or an effective fan club subscriber gets in. Anyone
 *     else is refused with 403 { error: 'fans_only' }, never a token.
 *   - paid (price_ngn > 0, not public): the viewer must hold an active
 *     paid connection, an effective fan club subscription with the
 *     host (fans enter free), OR be the host.
 *   - public: anyone signed in.
 * The API secret never leaves the server.
 */

type ServerClient = ReturnType<typeof createClient>;

/**
 * Effective fan club subscription: same rule as /api/subscriptions,
 * 'active', or 'cancelled' with the paid period still running.
 */
async function hasEffectiveSubscription(
  supabase: ServerClient,
  userId: string,
  providerId: string
): Promise<boolean> {
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('subscriber_id', userId)
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false })
    .limit(5);
  const nowMs = Date.now();
  return (subs ?? []).some(
    (s: { status: string; current_period_end: string }) =>
      s.status === 'active' ||
      (s.status === 'cancelled' &&
        new Date(s.current_period_end).getTime() > nowMs)
  );
}
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { sessionId, role, preview } = await req.json();
    if (!sessionId || !['publisher', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'sessionId and role required' }, { status: 400 });
    }
    // A pre-join preview is still a viewer, and every gate below
    // applies to it exactly the same: no free peek into a fans
    // only or paid room. It just mints a quieter token.
    const isPreview = preview === true && role === 'viewer';

    const { data: session } = await supabase
      .from('live_sessions')
      .select('id, provider_id, status, is_public, price_ngn, livekit_room, access_mode')
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
    } else if (session.access_mode === 'fans' && !isHost) {
      // Premium room gate, checked before any paid logic: fans only.
      // The host is already in. An accepted co-host or an appointed
      // moderator keeps their working access. Everyone else needs an
      // effective fan club subscription with the host; without one
      // there is no token, whatever else they hold.
      let allowed = false;
      const { data: cohost } = await supabase
        .from('live_cohosts')
        .select('id')
        .eq('session_id', sessionId)
        .eq('cohost_id', user.id)
        .eq('status', 'accepted')
        .maybeSingle();
      if (cohost) allowed = true;
      if (!allowed) {
        const { data: mod } = await supabase
          .from('stream_moderators')
          .select('id')
          .eq('session_id', sessionId)
          .eq('moderator_id', user.id)
          .maybeSingle();
        if (mod) allowed = true;
      }
      if (!allowed) {
        allowed = await hasEffectiveSubscription(
          supabase,
          user.id,
          session.provider_id
        );
      }
      if (!allowed) {
        return NextResponse.json({ error: 'fans_only' }, { status: 403 });
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
          allowed = await hasEffectiveSubscription(
            supabase,
            user.id,
            session.provider_id
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
        // Preview connections carry a marked identity so every
        // other client can leave them out of join announcements,
        // the audience list and the viewer count: they are
        // watching the shop window, not in the room yet.
        identity: isPreview ? `${user.id}#preview` : user.id,
        name: user.id.slice(0, 8),
        ttl: role === 'publisher' ? '4h' : isPreview ? '30m' : '2h',
      }
    );
    if (isPreview) at.metadata = JSON.stringify({ preview: true });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: role === 'publisher',
      canSubscribe: true,
      canPublishData: !isPreview,
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
