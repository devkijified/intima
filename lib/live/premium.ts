import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Premium (fans only) stream eligibility.
 *
 * Premium is earned, not given: a companion unlocks fans only streams
 * with a track record, not by asking. This evaluator is the single
 * source of truth. The create, start, schedule, and go-live routes
 * enforce it server-side, and GET /api/live/premium-status feeds the
 * same checklist to the studio UI so she can see exactly what is left.
 *
 * The numeric thresholds come from platform_settings (seeded in
 * migration 048) so they can be tuned from the admin panel. The
 * constants below are only the fallback when a settings row is
 * missing.
 *
 * Trust aggregates come from the map_providers view (migration 038),
 * the same numbers her public page shows. If she has no row on the
 * view (for example she is not showing on the map), the same
 * definitions are computed directly from connections and reviews.
 */

export interface PremiumCheck {
  key: string;
  label: string;
  passed: boolean;
  current: string;
  target: string;
}

export interface PremiumEligibility {
  eligible: boolean;
  checks: PremiumCheck[];
}

export const PREMIUM_DEFAULTS = {
  minBookings: 5,
  minRating: 4.5,
  minReviews: 3,
  minResponsePct: 80,
  maxCancelPct: 20,
};

// A response rate only counts once she has had at least this many
// eligible requests; below that there is nothing real to measure.
const RESPONSE_SAMPLE_MIN = 5;
// A cancellation rate is only judged once there is a small history
// behind it; a single early refund should not lock the feature.
const CANCEL_SAMPLE_MIN = 3;

interface Thresholds {
  minBookings: number;
  minRating: number;
  minReviews: number;
  minResponsePct: number;
  maxCancelPct: number;
}

async function readThresholds(db: SupabaseClient): Promise<Thresholds> {
  const t: Thresholds = { ...PREMIUM_DEFAULTS };
  const { data } = await db
    .from('platform_settings')
    .select('key, value')
    .in('key', [
      'premium_min_bookings',
      'premium_min_rating',
      'premium_min_reviews',
      'premium_min_response_pct',
      'premium_max_cancel_pct',
    ]);
  const num = (v: unknown): number | null => {
    const n =
      typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  for (const row of data ?? []) {
    const n = num((row as { value: unknown }).value);
    if (n === null) continue;
    switch ((row as { key: string }).key) {
      case 'premium_min_bookings':
        t.minBookings = n;
        break;
      case 'premium_min_rating':
        t.minRating = n;
        break;
      case 'premium_min_reviews':
        t.minReviews = n;
        break;
      case 'premium_min_response_pct':
        t.minResponsePct = n;
        break;
      case 'premium_max_cancel_pct':
        t.maxCancelPct = n;
        break;
    }
  }
  return t;
}

interface Aggregates {
  bookings: number;
  avgRating: number | null;
  reviewCount: number;
  responseRate: number | null;
  cancellationRate: number | null;
  eligibleCount: number;
  refundedCount: number;
}

async function readAggregates(
  db: SupabaseClient,
  providerId: string
): Promise<Aggregates> {
  const { data: view } = await db
    .from('map_providers')
    .select(
      'booking_count, avg_rating, review_count, response_rate, cancellation_rate, eligible_connection_count'
    )
    .eq('provider_id', providerId)
    .maybeSingle();
  if (view) {
    const eligible = (view.eligible_connection_count as number | null) ?? 0;
    const cancelRate = view.cancellation_rate as number | null;
    return {
      bookings: (view.booking_count as number | null) ?? 0,
      avgRating: (view.avg_rating as number | null) ?? null,
      reviewCount: (view.review_count as number | null) ?? 0,
      responseRate: (view.response_rate as number | null) ?? null,
      cancellationRate: cancelRate,
      eligibleCount: eligible,
      refundedCount: cancelRate !== null ? Math.round(cancelRate * eligible) : 0,
    };
  }

  // Fallback for a provider with no map row: identical definitions to
  // migration 038, computed from the source tables.
  const { data: conns } = await db
    .from('connections')
    .select('id, status')
    .eq('provider_id', providerId)
    .in('status', ['active', 'refunded', 'expired']);
  const rows = (conns ?? []) as { id: string; status: string }[];
  const eligible = rows.length;
  const bookings = rows.filter((r) => r.status === 'active').length;
  const refunded = rows.filter((r) => r.status === 'refunded').length;
  let responded = 0;
  if (rows.length > 0) {
    const { data: msgs } = await db
      .from('messages')
      .select('connection_id')
      .eq('sender_id', providerId)
      .in(
        'connection_id',
        rows.map((r) => r.id)
      );
    responded = new Set(
      ((msgs ?? []) as { connection_id: string }[]).map((m) => m.connection_id)
    ).size;
  }
  const { data: revs } = await db
    .from('reviews')
    .select('rating, reviewer_id, client_id')
    .eq('provider_id', providerId)
    .eq('status', 'published');
  const published = ((revs ?? []) as {
    rating: number;
    reviewer_id: string;
    client_id: string;
  }[]).filter((r) => r.reviewer_id === r.client_id);
  const reviewCount = published.length;
  const avgRating =
    reviewCount > 0
      ? published.reduce((sum, r) => sum + r.rating, 0) / reviewCount
      : null;
  return {
    bookings,
    avgRating,
    reviewCount,
    responseRate: eligible > 0 ? responded / eligible : null,
    cancellationRate: eligible > 0 ? refunded / eligible : null,
    eligibleCount: eligible,
    refundedCount: refunded,
  };
}

export async function getPremiumEligibility(
  db: SupabaseClient,
  providerId: string
): Promise<PremiumEligibility> {
  const [thresholds, profileRes, agg] = await Promise.all([
    readThresholds(db),
    db
      .from('profiles')
      .select('verification_status, sub_price_coins, is_hidden')
      .eq('id', providerId)
      .maybeSingle(),
    readAggregates(db, providerId),
  ]);
  const profile = profileRes.data as {
    verification_status: string | null;
    sub_price_coins: number | null;
    is_hidden: boolean | null;
  } | null;
  const t = thresholds;
  const checks: PremiumCheck[] = [];

  const verified = profile?.verification_status === 'verified';
  checks.push({
    key: 'verified',
    label: 'ID verified',
    passed: verified,
    current: verified ? 'Verified' : 'Not verified',
    target: 'Verified',
  });

  checks.push({
    key: 'bookings',
    label: `${t.minBookings} completed bookings`,
    passed: agg.bookings >= t.minBookings,
    current: `${agg.bookings}`,
    target: `${t.minBookings}`,
  });

  const avgShown =
    agg.avgRating !== null ? Math.round(agg.avgRating * 10) / 10 : null;
  checks.push({
    key: 'rating',
    label: `${t.minRating} rating from ${t.minReviews} or more reviews`,
    passed:
      avgShown !== null &&
      avgShown >= t.minRating &&
      agg.reviewCount >= t.minReviews,
    current:
      avgShown !== null && agg.reviewCount > 0
        ? `${avgShown} average from ${agg.reviewCount} review${agg.reviewCount === 1 ? '' : 's'}`
        : 'No reviews yet',
    target: `${t.minRating} from ${t.minReviews} or more reviews`,
  });

  const responseSampleOk = agg.eligibleCount >= RESPONSE_SAMPLE_MIN;
  checks.push({
    key: 'response',
    label: `Replies to ${t.minResponsePct}% of requests`,
    passed:
      responseSampleOk &&
      agg.responseRate !== null &&
      agg.responseRate * 100 >= t.minResponsePct,
    current: !responseSampleOk
      ? `${agg.eligibleCount} of ${RESPONSE_SAMPLE_MIN} requests so far`
      : `${Math.round((agg.responseRate ?? 0) * 100)}%`,
    target: `${t.minResponsePct}%`,
  });

  // Too small a history is not judged: no refunds at all, or only a
  // couple of eligible bookings so far, both pass.
  let cancelPassed: boolean;
  if (agg.refundedCount === 0) cancelPassed = true;
  else if (agg.eligibleCount < CANCEL_SAMPLE_MIN) cancelPassed = true;
  else cancelPassed = (agg.cancellationRate ?? 0) * 100 < t.maxCancelPct;
  checks.push({
    key: 'cancellations',
    label: `Cancellations under ${t.maxCancelPct}%`,
    passed: cancelPassed,
    current:
      agg.refundedCount === 0
        ? 'No cancellations on record'
        : `${Math.round((agg.cancellationRate ?? 0) * 100)}%`,
    target: `Under ${t.maxCancelPct}%`,
  });

  const fanPrice = profile?.sub_price_coins ?? 0;
  checks.push({
    key: 'fanclub',
    label: 'Fan club open',
    passed: fanPrice > 0,
    current: fanPrice > 0 ? `${fanPrice} coins a month` : 'Not set',
    target: 'Fan club price set',
  });

  const hidden = profile?.is_hidden === true;
  checks.push({
    key: 'standing',
    label: 'Account in good standing',
    passed: !hidden,
    current: hidden ? 'Hidden after reports' : 'Good standing',
    target: 'Good standing',
  });

  return { eligible: checks.every((c) => c.passed), checks };
}

/** The checks she still has to clear, for 403 responses and UI copy. */
export function unmetChecks(result: PremiumEligibility): PremiumCheck[] {
  return result.checks.filter((c) => !c.passed);
}
