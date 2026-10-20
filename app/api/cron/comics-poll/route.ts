import { type NextRequest, NextResponse } from 'next/server';
import { fetchFeed } from '@/lib/comics/rss';
import { getComicFeeds, saveComicFeeds, importFeedItem } from '@/lib/comics/import';

/**
 * GET /api/cron/comics-poll: daily auto-publish for configured feeds.
 * Called by the GitHub Action (daily, Hobby-safe). Guarded by CRON_SECRET.
 * Only import from feeds you own or are licensed to republish.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const feeds = await getComicFeeds();
  const results: Record<string, number> = {};
  let changed = false;
  for (const feed of feeds) {
    try {
      const { items } = await fetchFeed(feed.url);
      // Feed order is newest-first; import oldest-first so numbering follows order.
      const fresh = items.filter((i) => i.images.length > 0);
      let imported = 0;
      for (const item of [...fresh].reverse()) {
        const ep = await importFeedItem(feed.id, feed.name, feed.url, item, true);
        if (ep) imported += 1;
        if (imported >= 5) break; // cap per feed per run
      }
      if (fresh[0]) {
        feed.lastGuid = fresh[0].guid;
        changed = true;
      }
      results[feed.id] = imported;
    } catch {
      results[feed.id] = -1; // feed fetch failure, retried next run
    }
  }
  if (changed) await saveComicFeeds(feeds);
  return NextResponse.json({ ok: true, results });
}
