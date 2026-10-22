import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const READER_COOKIE = 'intima_reader_id';
const READER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year

/**
 * POST /api/comics/track: record an episode view / completion.
 * Body: { episodeId, completed?, viewerKey? }.
 *
 * One view means one unique reader, and reader identity has to be
 * durable to mean anything. Signed-in readers are their user id.
 * Guests are an httpOnly cookie (intima_reader_id, one year) set by
 * this route when absent: unlike the old localStorage viewer key,
 * the cookie survives storage clears being undone by the browser,
 * is shared by the tab and the installed app on the same browser,
 * and never regenerates per visit. A legacy localStorage viewerKey
 * is adopted as the cookie value on first sight so an existing
 * guest keeps their identity instead of being counted twice.
 *
 * view_count increments ONLY when the read row genuinely lands:
 * the insert is attempted first and a unique violation (23505)
 * means this reader already counted, so racing opens from the same
 * reader can never double count.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { episodeId, viewerKey, completed } = await req.json().catch(() => ({}));
  if (typeof episodeId !== 'string' || !episodeId) {
    return NextResponse.json({ error: 'episodeId required' }, { status: 400 });
  }

  // Resolve (or mint) the durable guest identity.
  const cookieId = req.cookies.get(READER_COOKIE)?.value;
  const legacyKey = typeof viewerKey === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(viewerKey)
    ? viewerKey
    : null;
  const guestId = cookieId && /^[A-Za-z0-9_-]{8,80}$/.test(cookieId)
    ? cookieId
    : legacyKey ?? `r_${randomUUID()}`;
  const needsCookie = !cookieId;
  // The identity comic_reads keys on (its viewer_id column is
  // coalesce(user_id, viewer_key), so this is the same value).
  const readerId = user ? user.id : guestId;

  const respond = (body: Record<string, unknown>, status = 200) => {
    const res = NextResponse.json(body, { status });
    if (needsCookie) {
      res.cookies.set(READER_COOKIE, guestId, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: READER_COOKIE_MAX_AGE,
        secure: process.env.NODE_ENV === 'production',
      });
    }
    return res;
  };

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: ep } = await svc.from('comic_episodes')
    .select('id, status').eq('id', episodeId).maybeSingle();
  if (!ep || ep.status !== 'published') {
    return respond({ error: 'Episode not found' }, 404);
  }

  const { error: insertError } = await svc.from('comic_reads').insert({
    episode_id: episodeId,
    user_id: user?.id ?? null,
    viewer_key: user ? null : guestId,
    completed: !!completed,
    completed_at: completed ? new Date().toISOString() : null,
  });

  if (!insertError) {
    // A genuinely new read row landed: this is the only increment.
    const { error: rpcError } = await svc.rpc('increment_comic_views', { ep: episodeId });
    if (rpcError) {
      // Fallback if the RPC is missing: direct increment.
      const { data: cur } = await svc.from('comic_episodes')
        .select('view_count').eq('id', episodeId).single();
      await svc.from('comic_episodes')
        .update({ view_count: (cur?.view_count ?? 0) + 1 })
        .eq('id', episodeId);
    }
  } else if (insertError.code === '23505') {
    // Already counted for this reader. Only a first completion is
    // still worth recording.
    if (completed) {
      await svc.from('comic_reads')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .match({ episode_id: episodeId, viewer_id: readerId })
        .eq('completed', false);
    }
  }
  // Any other insert error leaves the counter untouched: an
  // unrecorded read must never inflate the view count.

  return respond({ ok: true });
}
