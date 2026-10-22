import type { MetadataRoute } from 'next';
import { NIGERIA_CITIES } from '@/lib/cities';
import { SITE_URL, cityToSlug, publicAnonClient } from '@/lib/seo';

export const revalidate = 3600;

/**
 * Dynamic sitemap at /sitemap.xml: the static public routes, every
 * city page, every published comic series and episode, and the
 * public companion links of verified companions. Each dynamic source
 * is fetched with the public anon client inside its own try/catch:
 * if one query fails, the sitemap still ships everything else.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/live`, lastModified: now, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${SITE_URL}/comics`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    ...NIGERIA_CITIES.map((city) => ({
      url: `${SITE_URL}/city/${cityToSlug(city)}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];

  // Companion public links: verified companions with a username,
  // from the same map view the app reads.
  try {
    const supabase = publicAnonClient();
    const { data, error } = await supabase
      .from('map_providers')
      .select('username, is_verified')
      .not('username', 'is', null)
      .limit(5000);
    if (error) throw error;
    for (const row of (data ?? []) as { username: string | null; is_verified: boolean | null }[]) {
      if (!row.username || row.is_verified !== true) continue;
      entries.push({
        url: `${SITE_URL}/companion/${encodeURIComponent(row.username)}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  } catch {
    // Static entries still ship.
  }

  // Published comic series.
  try {
    const supabase = publicAnonClient();
    const { data, error } = await supabase
      .from('comics')
      .select('id, created_at')
      .eq('status', 'published')
      .limit(1000);
    if (error) throw error;
    for (const row of (data ?? []) as { id: string; created_at: string | null }[]) {
      entries.push({
        url: `${SITE_URL}/comics/series/${row.id}`,
        lastModified: row.created_at ? new Date(row.created_at) : now,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
  } catch {
    // Static entries still ship.
  }

  // Published comic episodes.
  try {
    const supabase = publicAnonClient();
    const { data, error } = await supabase
      .from('comic_episodes')
      .select('id, published_at')
      .eq('status', 'published')
      .limit(5000);
    if (error) throw error;
    for (const row of (data ?? []) as { id: string; published_at: string | null }[]) {
      entries.push({
        url: `${SITE_URL}/comics/${row.id}`,
        lastModified: row.published_at ? new Date(row.published_at) : now,
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }
  } catch {
    // Static entries still ship.
  }

  return entries;
}
