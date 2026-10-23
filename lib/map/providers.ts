// Unified provider shape for the Intima Map.
//
// Two sources feed the map:
//  1. The public `map_providers` database view (supabase/migrations/004_map_public.sql),
//     which exposes only stranger-safe columns for providers who opted in
//     (show_on_map = true). Works logged out.
//  2. The local mock providers as a fallback when the view is unreachable or
//     empty (e.g. before the migration is run, or offline).
//
// Privacy: coordinates are AREA level only, never exact addresses.

import { createClient } from '@/lib/supabase/client';
import { MOCK_PROVIDERS, type MockProvider } from './mockProviders';
import { cleanSpec, type SpecValues } from '@/lib/spec';

const EMPTY_SPEC: SpecValues = { complexion: null, bodyType: null, height: null, tags: [] };

export interface MapProvider {
  id: string;
  boosted?: boolean;
  /** Standing travel setting: 'none' | 'selected' | 'nationwide'. */
  travelMode: string;
  travelCities: string[];
  /** Earliest current or upcoming tour, for "In {city}" chips. */
  nextTour: { city: string; start: string; end: string } | null;
  trustTier?: string;
  displayName: string;
  age: number | null;
  city: string;
  area: string;
  lat: number;
  lng: number;
  verified: boolean;
  available: boolean;
  rating: number | null;
  reviewCount: number;
  ratePerHour: number | null; // naira, null = "rate on request"
  // Rate card in naira, shown before any connection fee is paid.
  // null = not listed yet (the sheet says so instead of hiding).
  rateShortTime: number | null;
  rateOvernight: number | null;
  rateWeekend: number | null;
  /** Catalog ids from lib/services.ts. Empty array = not listed yet. */
  services: string[];
  /** Vibe tags from lib/vibes.ts, admin presets or her own words. */
  vibes: string[];
  /** Her declared spec from lib/spec.ts (all unset = empty spec). */
  spec: SpecValues;
  avatar: string;
  userId: string | null; // null for mock/preview pins
  username: string | null;
  /** ISO timestamp of last presence update. Null = unknown, no chip shown. */
  lastActiveAt: string | null;
  /** False = her rates are fixed, not open to offers. */
  ratesNegotiable: boolean;
  /** Photo gallery URLs in display order. avatar is the cover. */
  gallery: string[];
  /** Profile video clip URLs. */
  videos: string[];
  /** Profile view count (traction). */
  viewCount: number;
  /** Completed bookings (inDrive-style traction). */
  bookingCount: number;
}

interface MapProviderRow {
  provider_id: string;
  username?: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
  city: string;
  area_lat: number;
  area_lng: number;
  is_available: boolean | null;
  rate_short_time_ngn: number | null;
  rate_overnight_ngn: number | null;
  rate_weekend_ngn: number | null;
  services: string[] | null;
  vibes: string[] | null;
  last_active_at: string | null;
  rates_negotiable: boolean | null;
  gallery_urls: string[] | null;
  view_count: number | null;
  review_count: number | null;
  avg_rating: number | null;
  booking_count: number | null;
  video_urls: string[] | null;
  travel_mode?: string | null;
  travel_cities?: string[] | null;
  trust_tier?: string | null;
}

const MOCK_TRAVEL: Record<string, { mode: string; cities: string[] }> = {};

export function mockToMapProvider(m: MockProvider): MapProvider {
  const t = MOCK_TRAVEL[m.id] ?? { mode: 'none', cities: [] as string[] };
  return {
    travelMode: t.mode,
    travelCities: t.cities,
    nextTour: null,
    id: m.id,
    displayName: m.displayName,
    age: m.age,
    city: m.city,
    area: m.area,
    lat: m.lat,
    lng: m.lng,
    verified: m.verified,
    available: m.available,
    rating: m.rating,
    reviewCount: m.reviewCount,
    ratePerHour: m.ratePerHour,
    rateShortTime: m.rateShortTime,
    rateOvernight: m.rateOvernight,
    rateWeekend: m.rateWeekend,
    services: m.services,
    vibes: m.vibes ?? [],
    spec: m.spec ?? EMPTY_SPEC,
    avatar: m.avatar,
    userId: m.userId,
    username: null,
    lastActiveAt: m.lastActiveAt,
    ratesNegotiable: m.ratesNegotiable,
    gallery: m.gallery,
    viewCount: m.viewCount,
    bookingCount: m.bookingCount,
    videos: m.videos,
  };
}

/** Deterministic placeholder avatar index so a provider keeps the same face. */
function hashToImg(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return (h % 70) + 1;
}

function rowToMapProvider(row: MapProviderRow): MapProvider {
  return {
    id: `db-${row.provider_id}`,
    trustTier: row.trust_tier ?? 'verified',
    displayName: row.display_name || 'Intima companion',
    age: null,
    city: row.city,
    area: 'Approximate area',
    lat: row.area_lat,
    lng: row.area_lng,
    verified: row.is_verified === true,
    available: row.is_available === true,
    rating: row.avg_rating,
    reviewCount: row.review_count ?? 0,
    ratePerHour: null,
    rateShortTime: row.rate_short_time_ngn,
    rateOvernight: row.rate_overnight_ngn,
    rateWeekend: row.rate_weekend_ngn,
    services: row.services ?? [],
    vibes: row.vibes ?? [],
    spec: EMPTY_SPEC,
    avatar: row.avatar_url || `https://i.pravatar.cc/600?img=${hashToImg(row.provider_id)}`,
    userId: row.provider_id,
    username: row.username ?? null,
    lastActiveAt: row.last_active_at,
    ratesNegotiable: row.rates_negotiable !== false,
    gallery: row.gallery_urls ?? [],
    viewCount: row.view_count ?? 0,
    bookingCount: row.booking_count ?? 0,
    videos: row.video_urls ?? [],
    travelMode: row.travel_mode ?? 'none',
    travelCities: row.travel_cities ?? [],
    nextTour: null,
  };
}

/**
 * Load map pins. Tries the public database view first; falls back to the
 * local mock providers on any error or when the table is still empty.
 */
export async function fetchMapProviders(): Promise<MapProvider[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('map_providers')
      .select(
        'provider_id, username, display_name, avatar_url, is_verified, trust_tier, city, area_lat, area_lng, is_available, rate_short_time_ngn, rate_overnight_ngn, rate_weekend_ngn, services, last_active_at, rates_negotiable, gallery_urls, view_count, review_count, avg_rating, booking_count, video_urls, travel_mode, travel_cities, vibes',
      )
      .limit(300);
    if (error) throw error;
    const rows = (data ?? []) as MapProviderRow[];
    if (rows.length > 0) {
      const mapped = rows.map(rowToMapProvider);
      // Boosts: active boosts pin providers to the front.
      const { data: boosts } = await supabase
        .from('boosts')
        .select('provider_id')
        .gt('ends_at', new Date().toISOString());
      const boostedIds = new Set<string>(((boosts ?? []) as { provider_id: string }[]).map((b) => b.provider_id));
      for (const p of mapped) p.boosted = boostedIds.has(p.id.replace(/^db-/, ''));
      // Tours: attach each provider's earliest current/upcoming tour so
      // cards can say "In Abuja, Oct 18 to 22" and city filters can match.
      const today = new Date().toISOString().slice(0, 10);
      const { data: tours } = await supabase
        .from('tour_dates')
        .select('provider_id, city, start_date, end_date')
        .gte('end_date', today)
        .order('start_date', { ascending: true });
      for (const t of (tours ?? []) as { provider_id: string; city: string; start_date: string; end_date: string }[]) {
        const p = mapped.find((x) => x.id === `db-${t.provider_id}`);
        if (p && !p.nextTour) p.nextTour = { city: t.city, start: t.start_date, end: t.end_date };
      }
      // Specs: declared on profiles (migration 082), merged the
      // same way as boosts and tours. Best effort: before the
      // migration lands the select errors and every spec simply
      // stays unset, so an active spec filter matches nobody
      // rather than crashing the map.
      const { data: specRows } = await supabase
        .from('profiles')
        .select('id, spec_complexion, spec_body_type, spec_height, spec_tags')
        .in('id', rows.map((r) => r.provider_id));
      for (const s of (specRows ?? []) as { id: string; spec_complexion: string | null; spec_body_type: string | null; spec_height: string | null; spec_tags: string[] | null }[]) {
        const p = mapped.find((x) => x.id === `db-${s.id}`);
        if (p) {
          p.spec = cleanSpec({
            complexion: s.spec_complexion,
            bodyType: s.spec_body_type,
            height: s.spec_height,
            tags: s.spec_tags ?? [],
          });
        }
      }
      mapped.sort((a, b) => Number(b.boosted ?? false) - Number(a.boosted ?? false));
      return mapped;
    }
  } catch {
    // Fall through to mocks: map stays useful before migration / offline.
  }
  return MOCK_PROVIDERS.map(mockToMapProvider);
}
