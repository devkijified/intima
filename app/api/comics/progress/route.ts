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
 *   resume   -> the episode the reader touched most recently
 *               (their explicit pick wins over older unfinished
 *               chapters), still unfinished
 *   continue -> the chapter after the one they last finished
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
  // progress_pct arrives with migration 081 and last_read_at with
  // 083; if a column is not there yet, retry narrower so the
  // endpoint never breaks.
  const readReads = (cols: string) => {
    let q = svc.from('comic_reads')
      .select(cols)
      .in('episode_id', epIds);
    q = user ? q.eq('user_id', user.id) : q.eq('viewer_key', guestId as string);
    return q;
  };
  let { data: reads, error: readsErr } = await readReads('episode_id, completed, progress_pct, last_read_at');
  if (readsErr) {
    ({ data: reads, error: readsErr } = await readReads('episode_id, completed, last_read_at'));
  }
  if (readsErr) {
    ({ data: reads } = await readReads('episode_id, completed'));
  }
  type ReadRow = { episode_id: string; completed: boolean; progress_pct?: number | null; last_read_at?: string | null };
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

  // The reader's own latest move wins (owner rule, 2026-10-23):
  // the episode they touched most recently is their place, even
  // when an earlier chapter is still unfinished. Tapping
  // Episode 11 moves this button to Episode 11.
  const stamped = readRows.filter((r) => r.last_read_at);
  if (stamped.length > 0) {
    const last = stamped.reduce((a, b) => (String(a.last_read_at) >= String(b.last_read_at) ? a : b));
    const lastEp = episodes.find((e) => e.id === last.episode_id);
    if (lastEp) {
      if (!last.completed) {
        return NextResponse.json({
          state: 'resume',
          episodeId: lastEp.id,
          episodeNo: lastEp.episode_no,
          openedIds,
          completedIds,
          progressById,
        });
      }
      const after = episodes.find((e) => e.episode_no > lastEp.episode_no);
      if (after) {
        return NextResponse.json({
          state: 'continue',
          episodeId: after.id,
          episodeNo: after.episode_no,
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
  }

  // No timestamps on record (rows older than migration 083):
  // fall back to the lowest-numbered unfinished chapter.
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
