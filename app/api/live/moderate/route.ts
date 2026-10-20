import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck';

/**
 * POST /api/live/moderate
 * Moderation and stream settings for a live session.
 * Body: { sessionId, action, targetUserId?, targetUsername?, messageId?,
 *         pinnedText?, slowModeSeconds?, blockedWords? }.
 *
 * Authorization: the host (live_sessions.provider_id) can do everything.
 * Appointed moderators (stream_moderators) can only mute viewers and
 * delete messages. Host-only actions: appoint_mod, remove_mod, set_pin,
 * set_slow, set_blocked_words.
 *
 * Deleting a message: chat travels as LiveKit data packets, so no server
 * can pull a packet back. Deletion writes a row to live_chat_deletions
 * and every client subscribed via Realtime hides that message id.
 */
const HOST_ONLY = new Set([
  'appoint_mod',
  'remove_mod',
  'set_pin',
  'set_slow',
  'set_blocked_words',
]);
const MOD_ALLOWED = new Set(['mute_viewer', 'delete_message']);

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId, action } = body as { sessionId?: string; action?: string };
    if (!sessionId || !action) {
      return NextResponse.json({ error: 'sessionId and action required' }, { status: 400 });
    }
    if (!HOST_ONLY.has(action) && !MOD_ALLOWED.has(action)) {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: session } = await service
      .from('live_sessions')
      .select('id, provider_id')
      .eq('id', sessionId)
      .single();
    if (!session) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    const isHost = session.provider_id === user.id;
    let isMod = false;
    if (!isHost) {
      const { data: modRow } = await service
        .from('stream_moderators')
        .select('id')
        .eq('session_id', sessionId)
        .eq('moderator_id', user.id)
        .maybeSingle();
      isMod = !!modRow;
    }
    if (!isHost && !isMod) {
      return NextResponse.json({ error: 'Not allowed in this stream' }, { status: 403 });
    }
    if (HOST_ONLY.has(action) && !isHost) {
      return NextResponse.json({ error: 'Only the host can do that' }, { status: 403 });
    }

    // Resolve a target user from an id or a profiles username.
    const resolveTarget = async (): Promise<string | null> => {
      if (typeof body.targetUserId === 'string' && body.targetUserId) {
        return body.targetUserId;
      }
      if (typeof body.targetUsername === 'string' && body.targetUsername.trim()) {
        const { data: prof } = await service
          .from('profiles')
          .select('id')
          .eq('username', body.targetUsername.trim().toLowerCase())
          .maybeSingle();
        return prof?.id ?? null;
      }
      return null;
    };

    if (action === 'delete_message') {
      if (!body.messageId) {
        return NextResponse.json({ error: 'messageId required' }, { status: 400 });
      }
      const { error } = await service.from('live_chat_deletions').upsert(
        { session_id: sessionId, message_id: String(body.messageId), created_by: user.id },
        { onConflict: 'session_id,message_id' }
      );
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'mute_viewer') {
      const target = await resolveTarget();
      if (!target) {
        return NextResponse.json({ error: 'Target user not found' }, { status: 400 });
      }
      if (target === session.provider_id) {
        return NextResponse.json({ error: 'The host cannot be muted' }, { status: 400 });
      }
      const { error } = await service.from('stream_moderation').upsert(
        { session_id: sessionId, user_id: target, action: 'mute' },
        { onConflict: 'session_id,user_id' }
      );
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'appoint_mod') {
      const target = await resolveTarget();
      if (!target) {
        return NextResponse.json({ error: 'Target user not found' }, { status: 400 });
      }
      if (target === session.provider_id) {
        return NextResponse.json({ error: 'The host is already in charge' }, { status: 400 });
      }
      const { error } = await service.from('stream_moderators').upsert(
        { session_id: sessionId, moderator_id: target, appointed_by: user.id },
        { onConflict: 'session_id,moderator_id' }
      );
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'remove_mod') {
      const target = await resolveTarget();
      if (!target) {
        return NextResponse.json({ error: 'Target user not found' }, { status: 400 });
      }
      const { error } = await service
        .from('stream_moderators')
        .delete()
        .eq('session_id', sessionId)
        .eq('moderator_id', target);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'set_pin') {
      const text =
        typeof body.pinnedText === 'string' ? body.pinnedText.trim().slice(0, 200) : '';
      if (text) {
        // The pin is public stream text, so the fence scan applies.
        const scan = scanForLeaks(text);
        if (!scan.clean) {
          return NextResponse.json({ error: leakWarning(scan.leaks) }, { status: 400 });
        }
      }
      const { error } = await service
        .from('live_sessions')
        .update({ pinned_text: text || null })
        .eq('id', sessionId);
      if (error) throw error;
      return NextResponse.json({ ok: true, pinnedText: text || null });
    }

    if (action === 'set_slow') {
      const secs = Number(body.slowModeSeconds);
      if (!Number.isFinite(secs) || secs < 0 || secs > 300) {
        return NextResponse.json(
          { error: 'slowModeSeconds must be between 0 and 300' },
          { status: 400 }
        );
      }
      const { error } = await service
        .from('live_sessions')
        .update({ slow_mode_seconds: Math.round(secs) })
        .eq('id', sessionId);
      if (error) throw error;
      return NextResponse.json({ ok: true, slowModeSeconds: Math.round(secs) });
    }

    if (action === 'set_blocked_words') {
      if (!Array.isArray(body.blockedWords)) {
        return NextResponse.json({ error: 'blockedWords must be an array' }, { status: 400 });
      }
      const words = [...new Set(
        body.blockedWords
          .filter((w: unknown): w is string => typeof w === 'string')
          .map((w: string) => w.trim().toLowerCase())
          .filter((w: string) => w.length > 0 && w.length <= 40)
      )].slice(0, 50);
      const { error } = await service
        .from('live_sessions')
        .update({ blocked_words: words })
        .eq('id', sessionId);
      if (error) throw error;
      return NextResponse.json({ ok: true, blockedWords: words });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[live/moderate]', e);
    return NextResponse.json({ error: 'Moderation failed' }, { status: 500 });
  }
}
