import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const READER_COOKIE = 'intima_reader_id';

/**
 * GET /api/comics/continue
 *
 * The one comic this reader is in the middle of, for the
 * dashboard Continue Reading card. Identity follows the same
 * rules as /api/comics/track and /api/comics/progress:
 * signed-in user id, else the durable guest cookie.
 *
 * Recency is comic_reads.last_read_at (migration 083): the most
 * recently touched series wins. Inside that series the state
 * matches the series page CTA: resume the lowest opened but
 * unfinished episode, else continue with the chapter after the
 * last finished one. A finished series falls through to the
 * next most recent series with something left to read.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const cookieId = req.cookies.get(READER_COOKIE)?.value;
  const guestId = !user && cookieId && /^[A-Za-z0-9_-]{8,80}$/.test(cookieId) ? cookieId : null;
  if (!user && !guestId) {
    return NextResponse.json({ state: 'none' });
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  type ReadRow = {
    episode_id: string;
    completed: boolean;
    progress_pct?: number | null;
    last_read_at?: string | null;
    first_read_at?: string | null;
  };
  const baseReads = (withStamp: boolean) => {
    let q = svc
      .from('comic_reads')
      .select(
        withStamp
          ? 'episode_id, completed, progress_pct, last_read_at'
          : 'episode_id, completed, progress_pct, first_read_at'
      )
      .order(withStamp ? 'last_read_at' : 'first_read_at', { ascending: false })
      .limit(100);
    q = user ? q.eq('user_id', user.id) : q.eq('viewer_key', guestId as string);
    return q;
  };
  let { data: readData, error: readsErr } = await baseReads(true);
  if (readsErr) {
    ({ data: readData } = await baseReads(false));
  }
  const reads = (readData ?? []) as unknown as ReadRow[];
  if (reads.length === 0) {
    return NextResponse.json({ state: 'none' });
  }

  // Which series each read belongs to, most recent first.
  const { data: touchedEps } = await svc
    .from('comic_episodes')
    .select('id, comic_id')
    .in('id', reads.map((r) => r.episode_id));
  const seriesByEpisode = new Map((touchedEps ?? []).map((e) => [e.id, e.comic_id as string]));
  const seriesOrder: string[] = [];
  for (const r of reads) {
    const sid = seriesByEpisode.get(r.episode_id);
    if (sid && !seriesOrder.includes(sid)) seriesOrder.push(sid);
  }

  const readsByEpisode = new Map(reads.map((r) => [r.episode_id, r]));

  for (const seriesId of seriesOrder.slice(0, 5)) {
    const [{ data: series }, { data: eps }] = await Promise.all([
      svc.from('comics').select('id, title, cover_url, status').eq('id', seriesId).maybeSingle(),
      svc
        .from('comic_episodes')
        .select('id, episode_no, cover_url')
        .eq('comic_id', seriesId)
        .eq('status', 'published')
        .order('episode_no', { ascending: true }),
    ]);
    if (!series || series.status !== 'published' || !eps || eps.length === 0) continue;

    const opened = eps.filter((e) => readsByEpisode.has(e.id));
    if (opened.length === 0) continue;
    const completedNos = new Set(
      opened.filter((e) => readsByEpisode.get(e.id)?.completed).map((e) => e.episode_no as number)
    );

    const inProgress = eps.find(
      (e) => readsByEpisode.has(e.id) && !completedNos.has(e.episode_no as number)
    );
    if (inProgress) {
      const row = readsByEpisode.get(inProgress.id);
      return NextResponse.json({
        state: 'resume',
        seriesId,
        title: series.title,
        coverUrl: inProgress.cover_url ?? series.cover_url,
        episodeId: inProgress.id,
        episodeNo: inProgress.episode_no,
        totalEpisodes: eps.length,
        progressPct:
          typeof row?.progress_pct === 'number' ? row.progress_pct : null,
      });
    }

    const maxCompleted = completedNos.size > 0 ? Math.max(...completedNos) : 0;
    const next = eps.find((e) => (e.episode_no as number) > maxCompleted);
    if (next) {
      return NextResponse.json({
        state: 'continue',
        seriesId,
        title: series.title,
        coverUrl: next.cover_url ?? series.cover_url,
        episodeId: next.id,
        episodeNo: next.episode_no,
        totalEpisodes: eps.length,
        progressPct: null,
      });
    }
    // Finished this series: fall through to an older one.
  }

  return NextResponse.json({ state: 'none' });
}
