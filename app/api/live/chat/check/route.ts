import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck';

/**
 * POST /api/live/chat/check
 * The server-side gate for live chat. Body: { sessionId, body, messageId }.
 *
 * Honest architecture note: live chat is LiveKit data packets sent
 * client to client, so there is no server send path to intercept. This
 * route is a gate check the room page must call before it publishes a
 * packet: gate check first, then publish. A client that skips the gate
 * can still send packets, which is why this is enforcement for the real
 * app, not a cryptographic wall. It is also the only place slow mode,
 * per-stream blocked words, and mute state can be applied consistently.
 *
 * Checks, in order:
 * 1. Contact leak scan (the fence: contact details stay in paid
 *    connections, never in public stream chat).
 * 2. Per-stream blocked words set by the host.
 * 3. Mute or block rows in stream_moderation.
 * 4. Slow mode, using live_chat_log as the send record.
 * On a pass the message is written to live_chat_log and { ok: true }
 * is returned.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { sessionId, body, messageId } = await req.json();
    const text = typeof body === 'string' ? body.trim() : '';
    if (!sessionId || !text || !messageId) {
      return NextResponse.json(
        { error: 'sessionId, body and messageId required' },
        { status: 400 }
      );
    }
    if (text.length > 200) {
      return NextResponse.json({ error: 'Message is too long' }, { status: 400 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: session } = await service
      .from('live_sessions')
      .select('id, provider_id, status, slow_mode_seconds, blocked_words')
      .eq('id', sessionId)
      .single();
    if (!session) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }
    if (session.status !== 'live') {
      return NextResponse.json({ error: 'Stream is not live' }, { status: 400 });
    }

    // 1. Fence: contact leak scan.
    const scan = scanForLeaks(text);
    if (!scan.clean) {
      return NextResponse.json({ error: leakWarning(scan.leaks) }, { status: 400 });
    }

    // 2. Host blocked words for this stream.
    const words: string[] = Array.isArray(session.blocked_words)
      ? session.blocked_words
      : [];
    if (words.length > 0) {
      const lower = text.toLowerCase();
      const hit = words.some(
        (w) => typeof w === 'string' && w.trim() !== '' && lower.includes(w.toLowerCase())
      );
      if (hit) {
        return NextResponse.json(
          { error: 'That message contains a blocked word for this stream.' },
          { status: 400 }
        );
      }
    }

    // 3. Mute or block for this viewer in this stream.
    const { data: mod } = await service
      .from('stream_moderation')
      .select('action')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (mod?.action === 'block') {
      return NextResponse.json(
        { error: 'You are blocked from this stream' },
        { status: 403 }
      );
    }
    if (mod?.action === 'mute') {
      return NextResponse.json(
        { error: 'You are muted in this stream' },
        { status: 403 }
      );
    }

    // 4. Slow mode. Host and appointed moderators are exempt.
    const slow = Number(session.slow_mode_seconds ?? 0);
    if (slow > 0 && session.provider_id !== user.id) {
      const { data: modRow } = await service
        .from('stream_moderators')
        .select('id')
        .eq('session_id', sessionId)
        .eq('moderator_id', user.id)
        .maybeSingle();
      if (!modRow) {
        const { data: last } = await service
          .from('live_chat_log')
          .select('created_at')
          .eq('session_id', sessionId)
          .eq('sender_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (last?.created_at) {
          const elapsed = (Date.now() - new Date(last.created_at).getTime()) / 1000;
          if (elapsed < slow) {
            const retry = Math.ceil(slow - elapsed);
            return NextResponse.json(
              {
                error: `Slow mode is on. Wait ${retry}s before sending again.`,
                retryAfterSeconds: retry,
              },
              { status: 429 }
            );
          }
        }
      }
    }

    // Passed the gate: record the send, then the client publishes.
    const { error: logErr } = await service.from('live_chat_log').insert({
      session_id: sessionId,
      sender_id: user.id,
      message_id: String(messageId),
      body: text,
    });
    if (logErr) throw logErr;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[live/chat/check]', e);
    return NextResponse.json({ error: 'Chat check failed' }, { status: 500 });
  }
}
