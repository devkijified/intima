import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const READER_COOKIE = 'intima_reader_id';

/**
 * GET /api/comics/progress?series=<comicId>&viewerKey=<hint>
 *
 * Where this reader stopped in a series, resolved with the same
 * identity rules as /api/comics/track: signed-in user id, else the
 * durable guest cookie, else the reader's localStorage hint key.
 * The series page turns the answer into its main CTA:
 *   fresh    -> "Start reading: Episode 1"
 *   resume   -> an episode was opened but not finished
 *   continue -> the last finished episode's next chapter
 *   finished -> every published episode completed
 * Also returns the opened and completed episode ids so the episode
 * list can stop calling chapters the reader already finished "NEW".
 */
export async function GET(req: NextRequest) {
  const seriesId = req.nextUrl.searchParams.get('series');
  if (!seriesId) {
    return NextResponse.json({ error: 'series required' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const cookieId = req.cookies.get(READER_COOKIE)?.value;
  const hint = req.nextUrl.searchParams.get('viewerKey');
  const guestId = !user
    ? (cookieId && /^[A-Za-z0-9_-]{8,80}$/.test(cookieId)
        ? cookieId
        : hint && /^[A-Za-z0-9_-]{8,64}$/.test(hint)
          ? hint
          : null)
    : null;

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: eps } = await svc.from('comic_episodes')
    .select('id, episode_no')
    .eq('comic_id', seriesId)
    .eq('status', 'published')
    .order('episode_no', { ascending: true });
  const episodes = eps ?? [];
  if (episodes.length === 0) {
    return NextResponse.json({ state: 'fresh', openedIds: [], completedIds: [], progressById: {} });
  }

  if (!user && !guestId) {
    return NextResponse.json({ state: 'fresh', openedIds: [], completedIds: [], progressById: {} });
  }

  const epIds = episodes.map((e) => e.id);
  // progress_pct arrives with migration 081; if the column is not
  // there yet, retry without it so the endpoint never breaks.
  const readReads = (withPct: boolean) => {
    let q = svc.from('comic_reads')
      .select(withPct ? 'episode_id, completed, progress_pct' : 'episode_id, completed')
      .in('episode_id', epIds);
    q = user ? q.eq('user_id', user.id) : q.eq('viewer_key', guestId as string);
    return q;
  };
  let { data: reads, error: readsErr } = await readReads(true);
  if (readsErr) {
    ({ data: reads } = await readReads(false));
  }
  type ReadRow = { episode_id: string; completed: boolean; progress_pct?: number | null };
  const readRows = (reads ?? []) as unknown as ReadRow[];

  const openedIds = readRows.map((r) => r.episode_id);
  const completedIds = readRows.filter((r) => r.completed).map((r) => r.episode_id);
  const progressById: Record<string, number> = {};
  for (const r of readRows) {
    const pct = r.completed
      ? 100
      : typeof r.progress_pct === 'number'
        ? r.progress_pct
        : null;
    if (pct !== null) progressById[r.episode_id] = pct;
  }
  if (openedIds.length === 0) {
    return NextResponse.json({ state: 'fresh', openedIds, completedIds, progressById });
  }

  const noById = new Map(episodes.map((e) => [e.id, e.episode_no as number]));
  const openedNos = openedIds.map((eid) => noById.get(eid)).filter((n): n is number => n !== undefined);
  const completedNos = new Set(
    completedIds.map((eid) => noById.get(eid)).filter((n): n is number => n !== undefined)
  );

  // Mid-episode wins: the lowest-numbered chapter opened but never
  // finished is where the reader actually stopped.
  const inProgress = episodes.find(
    (e) => openedNos.includes(e.episode_no) && !completedNos.has(e.episode_no)
  );
  if (inProgress) {
    return NextResponse.json({
      state: 'resume',
      episodeId: inProgress.id,
      episodeNo: inProgress.episode_no,
      openedIds,
      completedIds,
      progressById,
    });
  }

  const maxCompleted = completedNos.size > 0 ? Math.max(...completedNos) : 0;
  const next = episodes.find((e) => e.episode_no > maxCompleted);
  if (next) {
    return NextResponse.json({
      state: 'continue',
      episodeId: next.id,
      episodeNo: next.episode_no,
      openedIds,
      completedIds,
      progressById,
    });
  }

  return NextResponse.json({
    state: 'finished',
    episodeId: episodes[0].id,
    episodeNo: episodes[0].episode_no,
    openedIds,
    completedIds,
    progressById,
  });
}
