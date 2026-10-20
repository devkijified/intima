import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchFeed } from '@/lib/comics/rss';
import { getComicFeeds, saveComicFeeds, importFeedItem } from '@/lib/comics/import';

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles')
    .select('role').eq('id', user.id).maybeSingle();
  return profile && ['admin', 'super_admin'].includes(profile.role) ? user : null;
}

/** GET /api/admin/comics/import: list configured feeds. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  return NextResponse.json({ feeds: await getComicFeeds() });
}

/**
 * POST /api/admin/comics/import
 *  { action: 'preview', url }: fetch a feed, return its items.
 *  { action: 'add-feed', url, name? }: save feed for daily auto-publish.
 *  { action: 'remove-feed', id }: stop polling a feed.
 *  { action: 'import', feedUrl, feedName, guid }: import one item now (draft).
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = body?.action as string;

  try {
    if (action === 'preview') {
      const url = String(body.url ?? '').trim();
      if (!url.startsWith('http')) return NextResponse.json({ error: 'Valid feed URL required' }, { status: 400 });
      const { name, items } = await fetchFeed(url);
      return NextResponse.json({ name, items: items.slice(0, 50).map((i) => ({ ...i, images: i.images.slice(0, 40) })) });
    }

    if (action === 'add-feed') {
      const url = String(body.url ?? '').trim();
      if (!url.startsWith('http')) return NextResponse.json({ error: 'Valid feed URL required' }, { status: 400 });
      const { name } = await fetchFeed(url); // validates the feed resolves
      const feeds = await getComicFeeds();
      const id = 'feed_' + Buffer.from(url).toString('base64url').slice(0, 24);
      if (!feeds.some((f) => f.id === id)) {
        feeds.push({ id, name: String(body.name ?? name), url, lastGuid: null });
        await saveComicFeeds(feeds);
      }
      return NextResponse.json({ success: true, feeds });
    }

    if (action === 'remove-feed') {
      const feeds = (await getComicFeeds()).filter((f) => f.id !== body.id);
      await saveComicFeeds(feeds);
      return NextResponse.json({ success: true, feeds });
    }

    if (action === 'import') {
      const url = String(body.feedUrl ?? '').trim();
      const feedName = String(body.feedName ?? 'Feed');
      if (!url.startsWith('http')) return NextResponse.json({ error: 'Valid feed URL required' }, { status: 400 });
      const { items } = await fetchFeed(url);
      const item = items.find((i) => i.guid === body.guid);
      if (!item) return NextResponse.json({ error: 'Item no longer in feed' }, { status: 404 });
      const ep = await importFeedItem('manual', feedName, url, item, body.publish === true);
      if (!ep) return NextResponse.json({ error: 'Item has no images or was already imported' }, { status: 422 });
      return NextResponse.json({ success: true, episode: ep });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Import failed' }, { status: 502 });
  }
}
