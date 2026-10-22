import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendPushToUsers } from '@/lib/push-server';
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck';

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles')
    .select('role').eq('id', user.id).maybeSingle();
  return profile && ['admin', 'super_admin'].includes(profile.role) ? user : null;
}

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** GET /api/admin/comics: series + episodes with per-episode stats. */
export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const db = svc();
  const { data: series } = await db.from('comics')
    .select('id, title, synopsis, cover_url, status, story_status, created_at')
    .order('created_at', { ascending: true });
  const { data: eps } = await db.from('comic_episodes')
    .select('id, episode_no, title, status, published_at, view_count, panel_urls, cover_url, synopsis, comic_id')
    .order('episode_no', { ascending: false });
  const ids = (eps ?? []).map((e: any) => e.id);
  let stats: Record<string, { readers: number; completed: number }> = {};
  if (ids.length > 0) {
    const { data: reads } = await db.from('comic_reads')
      .select('episode_id, completed').in('episode_id', ids);
    for (const r of (reads ?? []) as any[]) {
      const s = stats[r.episode_id] ?? { readers: 0, completed: 0 };
      s.readers += 1;
      if (r.completed) s.completed += 1;
      stats[r.episode_id] = s;
    }
  }
  return NextResponse.json({ comics: series ?? [], episodes: eps ?? [], stats });
}

/**
 * POST /api/admin/comics.
 * Create an episode draft: { title, synopsis?, coverUrl?, panelUrls, comicId? }.
 * Episode numbers run per series: a comic's episodes are 1, 2, 3...
 * Create a series instead: { series: { title, synopsis?, coverUrl? } }.
 */
export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const db = svc();

  if (body?.series && typeof body.series === 'object') {
    const st = typeof body.series.title === 'string' ? body.series.title.trim() : '';
    if (!st) return NextResponse.json({ error: 'A comic needs a title' }, { status: 400 });
    const scan = scanForLeaks(st + ' ' + (body.series.synopsis ?? ''));
    if (!scan.clean) {
      return NextResponse.json({ error: leakWarning(scan.leaks) }, { status: 422 });
    }
    const { data, error } = await db.from('comics').insert({
      title: st,
      synopsis: typeof body.series.synopsis === 'string' ? body.series.synopsis.trim() : '',
      cover_url: typeof body.series.coverUrl === 'string' && body.series.coverUrl.trim()
        ? body.series.coverUrl.trim()
        : null,
      status: 'published',
      story_status: body.series.storyStatus === 'completed' ? 'completed' : 'ongoing',
    }).select('id, title').single();
    if (error) throw error;
    return NextResponse.json({ success: true, comic: data });
  }

  if (body?.seriesStatusUpdate && typeof body.seriesStatusUpdate === 'object') {
    const sid = String(body.seriesStatusUpdate.id ?? '');
    const ss = body.seriesStatusUpdate.storyStatus === 'completed' ? 'completed' : 'ongoing';
    if (!sid) return NextResponse.json({ error: 'Comic id required' }, { status: 400 });
    const { error } = await db.from('comics').update({ story_status: ss }).eq('id', sid);
    if (error) throw error;
    return NextResponse.json({ success: true });
  }

  const { title, synopsis, coverUrl, panelUrls, comicId } = body;
  const t = typeof title === 'string' ? title.trim() : '';
  const panels = Array.isArray(panelUrls)
    ? panelUrls.map((u: any) => String(u).trim()).filter(Boolean)
    : [];
  if (!t || panels.length === 0) {
    return NextResponse.json({ error: 'Title and at least one panel URL are required' }, { status: 400 });
  }
  const scan = scanForLeaks(t + ' ' + (synopsis ?? ''));
  if (!scan.clean) {
    return NextResponse.json({ error: leakWarning(scan.leaks) }, { status: 422 });
  }
  // Episodes belong to a comic; with none named, use the first series.
  let targetComicId: string | null = typeof comicId === 'string' && comicId ? comicId : null;
  if (!targetComicId) {
    const { data: first } = await db.from('comics')
      .select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
    targetComicId = first?.id ?? null;
  }
  let maxQuery = db.from('comic_episodes')
    .select('episode_no').order('episode_no', { ascending: false }).limit(1);
  if (targetComicId) maxQuery = maxQuery.eq('comic_id', targetComicId);
  const { data: max } = await maxQuery.maybeSingle();
  const no = (max?.episode_no ?? 0) + 1;
  const { data, error } = await db.from('comic_episodes').insert({
    episode_no: no,
    title: t,
    synopsis: typeof synopsis === 'string' ? synopsis.trim() || null : null,
    cover_url: typeof coverUrl === 'string' && coverUrl.trim() ? coverUrl.trim() : panels[0],
    panel_urls: panels,
    comic_id: targetComicId,
    status: 'draft',
  }).select('id, episode_no').single();
  if (error) throw error;
  return NextResponse.json({ success: true, episode: data });
}

/** PATCH /api/admin/comics: publish (fans out push) or unpublish. Body: { id, action } */
export async function PATCH(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const { id, action } = await req.json().catch(() => ({}));
  if (typeof id !== 'string' || !['publish', 'unpublish'].includes(action)) {
    return NextResponse.json({ error: 'id and action=publish|unpublish required' }, { status: 400 });
  }
  const db = svc();
  const { data: ep } = await db.from('comic_episodes')
    .select('id, episode_no, title, status').eq('id', id).maybeSingle();
  if (!ep) return NextResponse.json({ error: 'Episode not found' }, { status: 404 });

  if (action === 'publish') {
    await db.from('comic_episodes').update({
      status: 'published',
      published_at: new Date().toISOString(),
    }).eq('id', id);
    // Fan out: every subscribed device hears about the new episode.
    try {
      const { data: subs } = await db.from('push_subscriptions').select('user_id');
      const userIds = [...new Set(((subs ?? []) as any[]).map((s) => s.user_id))];
      await sendPushToUsers(userIds, {
        title: `New episode: ${ep.title}`,
        body: `Episode ${ep.episode_no} is live. Come read it now.`,
        url: `/comics/${id}`,
        tag: `comic-${id}`,
      });
    } catch {
      /* push is best effort; the episode is still published */
    }
  } else {
    await db.from('comic_episodes').update({ status: 'draft' }).eq('id', id);
  }
  return NextResponse.json({ success: true });
}

/** DELETE /api/admin/comics?id=: remove a draft (published episodes stay). */
export async function DELETE(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const db = svc();
  await db.from('comic_episodes').delete().eq('id', id).eq('status', 'draft');
  return NextResponse.json({ success: true });
}
