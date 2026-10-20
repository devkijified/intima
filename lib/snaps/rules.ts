import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Private Snaps earning rules (owner decision, 2026-10-20).
 *
 * The fan club is a content product: a creator earns from it only
 * while the gallery is real, reviewed and fresh.
 *   - Light bar: ID verified and a fan club price set.
 *   - Content bar: at least 7 contents that COUNT. A video counts
 *     when it is approved and runs at least the minimum seconds.
 *     A photo counts when it is approved and sits in a collection
 *     (carousel) holding at least the minimum number of approved
 *     photos: single stray photos never count.
 *   - Human review: only 'approved' snaps are visible to fans or
 *     count for anything. Pending and rejected snaps are drafts.
 *   - Freshness: once the content bar is met, the newest approved
 *     content must be younger than the stale window. A stale
 *     gallery pauses new earnings (existing subscribers keep the
 *     access they already paid for).
 * Thresholds live in platform_settings so they can move without a
 * deploy; the constants below are only fallbacks.
 */

export interface SnapThresholds {
  minContents: number;
  minVideoSeconds: number;
  minCarouselPhotos: number;
  staleDays: number;
}

export const SNAPS_DEFAULTS: SnapThresholds = {
  minContents: 7,
  minVideoSeconds: 30,
  minCarouselPhotos: 5,
  staleDays: 30,
};

const KEYS: Record<keyof SnapThresholds, string> = {
  minContents: 'snaps_min_contents',
  minVideoSeconds: 'snaps_min_video_seconds',
  minCarouselPhotos: 'snaps_min_carousel_photos',
  staleDays: 'snaps_stale_days',
};

export async function readSnapThresholds(
  db: SupabaseClient
): Promise<SnapThresholds> {
  const t: SnapThresholds = { ...SNAPS_DEFAULTS };
  const { data } = await db
    .from('platform_settings')
    .select('key, value')
    .in('key', Object.values(KEYS));
  for (const row of (data ?? []) as { key: string; value: unknown }[]) {
    const field = (Object.keys(KEYS) as (keyof SnapThresholds)[]).find(
      (k) => KEYS[k] === row.key
    );
    if (!field) continue;
    const n =
      typeof row.value === 'number'
        ? row.value
        : typeof row.value === 'string'
          ? Number(row.value)
          : NaN;
    if (Number.isFinite(n) && n > 0) t[field] = n;
  }
  return t;
}

export interface SnapCheck {
  key: string;
  label: string;
  passed: boolean;
  current: string;
  target: string;
}

export interface SnapStanding {
  canEarn: boolean;
  /** Why earning is off, when it is: 'not_verified' | 'no_price' |
   * 'hidden' | 'building' | 'stale'. Null when canEarn. */
  blockedBy: string | null;
  verified: boolean;
  hasPrice: boolean;
  countingContents: number;
  approvedContents: number;
  pendingCount: number;
  lastApprovedAt: string | null;
  stale: boolean;
  checks: SnapCheck[];
  thresholds: SnapThresholds;
}

interface SnapRowLite {
  media_type: string;
  collection: string;
  review_status: string;
  duration_seconds: number | null;
  created_at: string;
}

export async function getSnapStanding(
  db: SupabaseClient,
  providerId: string
): Promise<SnapStanding> {
  const t = await readSnapThresholds(db);

  const { data: profile } = await db
    .from('profiles')
    .select('verification_status, sub_price_coins, is_hidden')
    .eq('id', providerId)
    .maybeSingle();
  const verified = profile?.verification_status === 'verified';
  const hasPrice =
    typeof profile?.sub_price_coins === 'number' && profile.sub_price_coins > 0;
  const hidden = profile?.is_hidden === true;

  const { data: rows } = await db
    .from('private_snaps')
    .select('media_type, collection, review_status, duration_seconds, created_at')
    .eq('provider_id', providerId)
    .limit(1000);
  const snaps = (rows ?? []) as SnapRowLite[];

  const approved = snaps.filter((s) => s.review_status === 'approved');
  const pendingCount = snaps.filter((s) => s.review_status === 'pending').length;

  // Photos count only inside a carousel that meets the minimum.
  const approvedPhotosByCollection = new Map<string, number>();
  for (const s of approved) {
    if (s.media_type === 'image') {
      approvedPhotosByCollection.set(
        s.collection,
        (approvedPhotosByCollection.get(s.collection) ?? 0) + 1
      );
    }
  }
  let countingPhotos = 0;
  for (const s of approved) {
    if (s.media_type !== 'image') continue;
    if ((approvedPhotosByCollection.get(s.collection) ?? 0) >= t.minCarouselPhotos) {
      countingPhotos += 1;
    }
  }
  const countingVideos = approved.filter(
    (s) =>
      s.media_type === 'video' &&
      (s.duration_seconds ?? 0) >= t.minVideoSeconds
  ).length;
  const countingContents = countingPhotos + countingVideos;

  const approvedTimes = approved
    .map((s) => new Date(s.created_at).getTime())
    .filter((n) => Number.isFinite(n));
  const lastApprovedAt =
    approvedTimes.length > 0
      ? new Date(Math.max(...approvedTimes)).toISOString()
      : null;
  const stale =
    countingContents >= t.minContents &&
    lastApprovedAt !== null &&
    Date.now() - new Date(lastApprovedAt).getTime() >
      t.staleDays * 24 * 60 * 60 * 1000;

  const checks: SnapCheck[] = [
    {
      key: 'verified',
      label: 'ID verified',
      passed: verified,
      current: verified ? 'Verified' : 'Not verified yet',
      target: 'Verified',
    },
    {
      key: 'price',
      label: 'Fan club price set',
      passed: hasPrice,
      current: hasPrice
        ? `${profile?.sub_price_coins} coins a month`
        : 'No price set',
      target: 'Set a price',
    },
    {
      key: 'contents',
      label: `${t.minContents} reviewed contents`,
      passed: countingContents >= t.minContents,
      current: `${countingContents} counting so far`,
      target: `${t.minContents} contents`,
    },
    {
      key: 'fresh',
      label: `New content within ${t.staleDays} days`,
      passed: !stale,
      current: stale
        ? 'Gallery has gone quiet'
        : lastApprovedAt
          ? 'Gallery is active'
          : 'Nothing approved yet',
      target: `Post within ${t.staleDays} days`,
    },
    {
      key: 'standing',
      label: 'Account in good standing',
      passed: !hidden,
      current: hidden ? 'Account paused' : 'Good standing',
      target: 'Good standing',
    },
  ];

  let blockedBy: string | null = null;
  if (!verified) blockedBy = 'not_verified';
  else if (!hasPrice) blockedBy = 'no_price';
  else if (hidden) blockedBy = 'hidden';
  else if (countingContents < t.minContents) blockedBy = 'building';
  else if (stale) blockedBy = 'stale';

  return {
    canEarn: blockedBy === null,
    blockedBy,
    verified,
    hasPrice,
    countingContents,
    approvedContents: approved.length,
    pendingCount,
    lastApprovedAt,
    stale,
    checks,
    thresholds: t,
  };
}

/** Fan-facing line for a blocked fan club, by reason. Kept free of
 * any assumption about the creator: callers pass the display name. */
export function snapBlockCopy(
  blockedBy: string | null,
  displayName: string
): string {
  switch (blockedBy) {
    case 'not_verified':
    case 'no_price':
    case 'hidden':
      return `${displayName} has not opened this fan club yet.`;
    case 'building':
      return `${displayName} is still building this collection. Subscriptions open once enough reviewed content is live.`;
    case 'stale':
      return `${displayName} has not posted new content in a while. Subscriptions reopen when fresh content lands.`;
    default:
      return `This fan club is not open right now.`;
  }
}
