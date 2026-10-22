import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchFeed } from '@/lib/comics/rss';
import { getComicFeeds, saveComicFeeds, importFeedItem, serviceDb } from '@/lib/comics/import';
import {
  fetchPageHtmlWithFallback, extractPanels, discoverChapters, detectStoryStatus, pageTitle,
} from '@/lib/comics/pageImport';
import { toCdnUrl, isPublicHttpUrl } from '@/lib/comics/cdn';
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck';
import { createHash } from 'crypto';

export const maxDuration = 60;

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

    if (action === 'page-preview') {
      const url = String(body.url ?? '').trim();
      if (!url.startsWith('http')) return NextResponse.json({ error: 'Valid page URL required' }, { status: 400 });
      const { html, relay } = await fetchPageHtmlWithFallback(url);
      const storyStatus = detectStoryStatus(html);
      const chapters = discoverChapters(html, url);
      if (chapters.length >= 2) {
        return NextResponse.json({
          kind: 'series',
          title: pageTitle(html, url),
          storyStatus,
          relay,
          chapters: chapters.slice(0, 60),
        });
      }
      const images = extractPanels(html, url);
      return NextResponse.json({
        kind: 'episode',
        title: pageTitle(html, url),
        storyStatus,
        relay,
        images: images.slice(0, 160),
      });
    }

    if (action === 'page-import') {
      const url = String(body.url ?? '').trim();
      const comicId = String(body.comicId ?? '').trim();
      if (!url.startsWith('http')) return NextResponse.json({ error: 'Valid page URL required' }, { status: 400 });
      if (!comicId) return NextResponse.json({ error: 'Pick the comic this episode belongs to first' }, { status: 400 });
      const db = serviceDb();
      const { data: comic } = await db.from('comics').select('id, title, story_status').eq('id', comicId).maybeSingle();
      if (!comic) return NextResponse.json({ error: 'That comic no longer exists' }, { status: 404 });

      const guid = 'page_' + createHash('sha256').update(url).digest('hex').slice(0, 24);
      const { data: dup } = await db.from('comic_episodes')
        .select('id, episode_no').eq('import_guid', guid).maybeSingle();
      if (dup) {
        return NextResponse.json({ error: `That page was already imported as Episode ${dup.episode_no}. Delete that draft first if you want to redo it.` }, { status: 409 });
      }

      const { html } = await fetchPageHtmlWithFallback(url);
      const candidates = extractPanels(html, url);
      const keepList: string[] = Array.isArray(body.keep)
        ? body.keep.map((u: unknown) => String(u)) : [];
      let panels = candidates.filter((c) => c.keep).map((c) => c.url);
      if (keepList.length > 0) {
        const wanted = new Set(keepList);
        panels = candidates.filter((c) => wanted.has(c.url)).map((c) => c.url);
      }
      if (panels.length === 0) {
        return NextResponse.json({ error: 'No panels were kept from that page. Reopen the preview and tick the pictures that are panels.' }, { status: 422 });
      }
      panels = panels.slice(0, 160);

      const rawTitle = typeof body.title === 'string' && body.title.trim()
        ? body.title.trim()
        : pageTitle(html, url);
      const title = rawTitle.slice(0, 200);
      const scan = scanForLeaks(title);
      if (!scan.clean) return NextResponse.json({ error: leakWarning(scan.leaks) }, { status: 422 });

      const unsafe = panels.filter((u) => !isPublicHttpUrl(u));
      if (unsafe.length > 0) {
        return NextResponse.json({ error: 'That page points at image addresses we cannot serve.' }, { status: 422 });
      }
      const stored = panels.map(toCdnUrl);

      const { data: max } = await db.from('comic_episodes')
        .select('episode_no').eq('comic_id', comicId)
        .order('episode_no', { ascending: false }).limit(1).maybeSingle();
      const episode_no = (max?.episode_no ?? 0) + 1;
      let host = url;
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
      const { data, error } = await db.from('comic_episodes').insert({
        episode_no,
        title,
        synopsis: null,
        cover_url: stored[0],
        panel_urls: stored,
        comic_id: comicId,
        status: 'draft',
        import_guid: guid,
        import_source: 'page',
        source_name: host,
        source_link: url,
      }).select('id, episode_no').single();
      if (error) throw error;

      const storyStatus = detectStoryStatus(html);
      if (storyStatus && comic.story_status !== storyStatus) {
        await db.from('comics').update({ story_status: storyStatus }).eq('id', comicId);
      }
      return NextResponse.json({
        success: true,
        episode: data,
        panels: stored.length,
        cdn: stored.length,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: 'That address could not be read. Check it and try again.' }, { status: 502 });
  }
}
