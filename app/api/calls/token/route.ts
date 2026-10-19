import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/calls/token
 * Mints a LiveKit access token for a 1:1 call. Body: { peerId, kind: 'voice' | 'video' }.
 *
 * Room name is deterministic: `call-{sorted(userId, peerId).join('-')}` so both
 * sides land in the same room. Both participants can publish and subscribe.
 *
 * Gate: the two users must share an ACTIVE connection (either direction).
 * No active connection, no call. The API secret never leaves the server.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { peerId, kind } = await req.json();
    if (!peerId || typeof peerId !== 'string' || peerId === user.id) {
      return NextResponse.json({ error: 'Valid peerId required' }, { status: 400 });
    }
    if (kind !== 'voice' && kind !== 'video') {
      return NextResponse.json({ error: 'kind must be voice or video' }, { status: 400 });
    }

    // Peer must exist.
    const { data: peer } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', peerId)
      .maybeSingle();
    if (!peer) {
      return NextResponse.json({ error: 'Peer not found' }, { status: 404 });
    }

    // Active connection required (either direction).
    const { data: conn } = await supabase
      .from('connections')
      .select('id')
      .eq('status', 'active')
      .or(
        `and(client_id.eq.${user.id},provider_id.eq.${peerId}),and(client_id.eq.${peerId},provider_id.eq.${user.id})`
      )
      .limit(1)
      .maybeSingle();
    if (!conn) {
      return NextResponse.json(
        { error: 'An active connection is required to call' },
        { status: 403 }
      );
    }

    const roomName = `call-${[user.id, peerId].sort().join('-')}`;

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      {
        identity: user.id,
        name: user.id.slice(0, 8),
        ttl: '1h',
      }
    );
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return NextResponse.json({
      token: await at.toJwt(),
      url: process.env.LIVEKIT_URL,
      room: roomName,
    });
  } catch (e) {
    console.error('[calls/token]', e);
    return NextResponse.json({ error: 'Token mint failed' }, { status: 500 });
  }
}
