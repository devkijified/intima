import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * POST /api/comics/track — record an episode view / completion.
 * Body: { episodeId, viewerKey?, completed? }.
 * Guests track with a device viewer key; signed-in users with their id.
 * view_count increments once per viewer (first read), not per reload.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { episodeId, viewerKey, completed } = await req.json().catch(() => ({}));
  if (typeof episodeId !== 'string' || !episodeId) {
    return NextResponse.json({ error: 'episodeId required' }, { status: 400 });
  }
  const key = !user && typeof viewerKey === 'string' && viewerKey.length >= 8
    ? viewerKey.slice(0, 64)
    : null;
  if (!user && !key) {
    return NextResponse.json({ error: 'viewer identity required' }, { status: 400 });
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: ep } = await svc.from('comic_episodes')
    .select('id, status').eq('id', episodeId).maybeSingle();
  if (!ep || ep.status !== 'published') {
    return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
  }

  const match = user
    ? { episode_id: episodeId, user_id: user.id }
    : { episode_id: episodeId, viewer_key: key };

  const { data: existing } = await svc.from('comic_reads')
    .select('episode_id, completed').match(match).maybeSingle();

  if (!existing) {
    const { error } = await svc.from('comic_reads').insert({
      episode_id: episodeId,
      user_id: user?.id ?? null,
      viewer_key: key,
      completed: !!completed,
      completed_at: completed ? new Date().toISOString() : null,
    });
    if (!error) {
      await svc.rpc('increment_comic_views', { ep: episodeId }).then(
        () => {},
        async () => {
          // Fallback if the RPC is missing: direct increment.
          const { data: cur } = await svc.from('comic_episodes')
            .select('view_count').eq('id', episodeId).single();
          await svc.from('comic_episodes')
            .update({ view_count: (cur?.view_count ?? 0) + 1 })
            .eq('id', episodeId);
        }
      );
    }
  } else if (completed && !existing.completed) {
    await svc.from('comic_reads')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .match(match);
  }

  return NextResponse.json({ ok: true });
}
