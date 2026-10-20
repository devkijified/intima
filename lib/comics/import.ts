/**
 * Shared episode-import logic for comic feeds.
 * Used by the admin import API and the scheduled poller.
 * NOTE: only import from feeds you own or are licensed to republish.
 * Imported episodes carry source credit shown to readers.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendPushToUsers } from '@/lib/push-server';
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

export async function pushNewEpisode(id: string, episodeNo: number, title: string) {
  try {
    const db = serviceDb();
    const { data: subs } = await db.from('push_subscriptions').select('user_id');
    const userIds = [...new Set(((subs ?? []) as { user_id: string }[]).map((s) => s.user_id))];
    await sendPushToUsers(userIds, {
      title: `New episode: ${title}`,
      body: `Episode ${episodeNo} is live. Come read it now.`,
      url: `/comics/${id}`,
      tag: `comic-${id}`,
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
  if (publish) await pushNewEpisode(data.id, data.episode_no, item.title);
  return data;
}
