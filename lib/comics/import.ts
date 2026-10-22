/**
 * Shared episode-import logic for comic feeds.
 * Used by the admin import API and the scheduled poller.
 * NOTE: only import from feeds you own or are licensed to republish.
 * Imported episodes carry source credit shown to readers.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notifyUsers } from '@/lib/push-server';
import { scanForLeaks } from '@/lib/moderation/contactCheck';
import type { FeedItem } from './rss';

export function serviceDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getComicFeeds(): Promise<Array<{ id: string; name: string; url: string; lastGuid: string | null }>> {
  const db = serviceDb();
  const { data } = await db.from('platform_settings').select('value').eq('key', 'comic_feeds').maybeSingle();
  try {
    const arr = JSON.parse((data?.value as string) ?? '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function saveComicFeeds(feeds: Array<{ id: string; name: string; url: string; lastGuid: string | null }>) {
  const db = serviceDb();
  await db.from('platform_settings').upsert({ key: 'comic_feeds', value: JSON.stringify(feeds) }, { onConflict: 'key' });
}

/**
 * Tell a series' followers that a new episode landed: an in-app
 * notification plus a push each, and nobody else. This replaced the
 * old blast to every push subscriber. Best effort by design: a
 * fan-out failure never blocks publishing.
 */
export async function notifySeriesFollowers(comicId: string, episodeTitle: string) {
  try {
    const db = serviceDb();
    const [{ data: follows }, { data: comic }] = await Promise.all([
      db.from('comic_follows').select('user_id').eq('comic_id', comicId),
      db.from('comics').select('title').eq('id', comicId).maybeSingle(),
    ]);
    const userIds = [...new Set(((follows ?? []) as { user_id: string }[]).map((f) => f.user_id))];
    if (userIds.length === 0) return;
    await notifyUsers({
      userIds,
      type: 'comic_episode',
      title: `New episode: ${comic?.title ?? 'Intima Comics'}`,
      body: episodeTitle,
      link: `/comics/series/${comicId}`,
    });
  } catch {
    /* best effort */
  }
}

/**
 * Create a published episode from a feed item. Skips if the guid was
 * already imported from this feed. Returns the episode id or null.
 */
export async function importFeedItem(
  feedId: string,
  feedName: string,
  feedUrl: string,
  item: FeedItem,
  publish = true
): Promise<{ id: string; episode_no: number } | null> {
  if (item.images.length === 0) return null;
  const scan = scanForLeaks(item.title);
  if (!scan.clean) return null; // never import titles that smuggle contact info

  const db = serviceDb();
  const { data: max } = await db.from('comic_episodes')
    .select('episode_no').order('episode_no', { ascending: false }).limit(1).maybeSingle();
  const episode_no = (max?.episode_no ?? 0) + 1;

  const { data, error } = await db.from('comic_episodes').insert({
    episode_no,
    title: item.title,
    synopsis: item.description,
    cover_url: item.images[0],
    panel_urls: item.images,
    status: publish ? 'published' : 'draft',
    published_at: publish ? new Date().toISOString() : null,
    import_guid: item.guid,
    import_source: feedId,
    source_name: feedName,
    source_link: item.link ?? feedUrl,
  }).select('id, episode_no').single();
  if (error) {
    // Duplicate (already imported) is not a failure for the poller.
    if (error.code === '23505') return null;
    throw error;
  }
  // Feed episodes belong to no series, so there are no followers to
  // notify here. Series episodes notify their followers when an
  // admin publishes them (admin comics route).
  return data;
}
