import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notifyUsers } from '@/lib/push-server';

/**
 * POST /api/live/cohost
 * Co-host invites for a live session.
 *
 * Invite:  { action: 'invite', sessionId, username }
 *   Host only. Creates or refreshes a live_cohosts row in 'invited'
 *   state and notifies the invitee with a link to the room.
 *
 * Respond: { action: 'respond', sessionId, accept: boolean }
 *   The invitee accepts or declines. On accept, the token route starts
 *   allowing them a publisher token for the session.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const body = await req.json();
    const { action, sessionId } = body as { action?: string; sessionId?: string };
    if (!sessionId || (action !== 'invite' && action !== 'respond')) {
      return NextResponse.json({ error: 'sessionId and a valid action required' }, { status: 400 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: session } = await service
      .from('live_sessions')
      .select('id, provider_id, title')
      .eq('id', sessionId)
      .single();
    if (!session) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    if (action === 'invite') {
      if (session.provider_id !== user.id) {
        return NextResponse.json({ error: 'Only the host can invite a co-host' }, { status: 403 });
      }
      const username =
        typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      if (!username) {
        return NextResponse.json({ error: 'username required' }, { status: 400 });
      }
      const { data: target } = await service
        .from('profiles')
        .select('id, display_name')
        .eq('username', username)
        .maybeSingle();
      if (!target) {
        return NextResponse.json({ error: 'No user with that username' }, { status: 404 });
      }
      if (target.id === user.id) {
        return NextResponse.json({ error: 'You are already the host' }, { status: 400 });
      }
      const { error } = await service.from('live_cohosts').upsert(
        { session_id: sessionId, cohost_id: target.id, status: 'invited' },
        { onConflict: 'session_id,cohost_id' }
      );
      if (error) throw error;

      await notifyUsers({
        userIds: [target.id],
        type: 'system',
        title: 'Co-host invitation',
        body: `You were invited to co-host: ${session.title}`,
        link: `/live/${sessionId}`,
      });
      return NextResponse.json({ ok: true, cohostId: target.id });
    }

    // respond
    const accept = body.accept === true;
    const { data: row } = await service
      .from('live_cohosts')
      .select('id, status')
      .eq('session_id', sessionId)
      .eq('cohost_id', user.id)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: 'No invitation for this stream' }, { status: 404 });
    }
    const { error } = await service
      .from('live_cohosts')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', row.id);
    if (error) throw error;

    if (accept) {
      const { data: me } = await service
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();
      await notifyUsers({
        userIds: [session.provider_id],
        type: 'system',
        title: 'Co-host accepted',
        body: `${me?.display_name ?? 'Your co-host'} accepted and can now publish to your stream.`,
        link: `/live/${sessionId}`,
      });
    }
    return NextResponse.json({ ok: true, status: accept ? 'accepted' : 'declined' });
  } catch (e) {
    console.error('[live/cohost]', e);
    return NextResponse.json({ error: 'Co-host request failed' }, { status: 500 });
  }
}
