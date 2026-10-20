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

/** GET /api/admin/comics: list with per-episode stats. */
export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const db = svc();
  const { data: eps } = await db.from('comic_episodes')
    .select('id, episode_no, title, status, published_at, view_count, panel_urls, cover_url, synopsis')
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
  return NextResponse.json({ episodes: eps ?? [], stats });
}

/** POST /api/admin/comics: create draft. Body: { title, synopsis?, coverUrl?, panelUrls } */
export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const { title, synopsis, coverUrl, panelUrls } = await req.json().catch(() => ({}));
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
  const db = svc();
  const { data: max } = await db.from('comic_episodes')
    .select('episode_no').order('episode_no', { ascending: false }).limit(1).maybeSingle();
  const no = (max?.episode_no ?? 0) + 1;
  const { data, error } = await db.from('comic_episodes').insert({
    episode_no: no,
    title: t,
    synopsis: typeof synopsis === 'string' ? synopsis.trim() || null : null,
    cover_url: typeof coverUrl === 'string' && coverUrl.trim() ? coverUrl.trim() : panels[0],
    panel_urls: panels,
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
