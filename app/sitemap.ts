import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { NIGERIA_CITIES } from '@/lib/cities';

const BASE_URL = 'https://intima-snowy.vercel.app';

function cityToSlug(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/live`, lastModified: now, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${BASE_URL}/comics`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    ...NIGERIA_CITIES.map((city) => ({
      url: `${BASE_URL}/city/${cityToSlug(city)}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.9,
    })),
  ];

  // Dynamic companion pages: one entry per public map row with a
  // username. Uses a plain supabase-js client with the public anon key,
  // the same env vars the browser client uses in lib/supabase/client.ts.
  // On any error the sitemap falls back to the static entries only.
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data, error } = await supabase
      .from('map_providers')
      .select('username')
      .not('username', 'is', null)
      .limit(1000);
    if (error) throw error;
    for (const row of (data ?? []) as { username: string | null }[]) {
      if (!row.username) continue;
      entries.push({
        url: `${BASE_URL}/companion/${encodeURIComponent(row.username)}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
  } catch {
    // Static entries only.
  }

  return entries;
}
