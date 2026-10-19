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

export interface MapProvider {
  id: string;
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
  avatar: string;
  userId: string | null; // null for mock/preview pins
  /** ISO timestamp of last presence update. Null = unknown, no chip shown. */
  lastActiveAt: string | null;
  /** False = her rates are fixed, not open to offers. */
  ratesNegotiable: boolean;
  /** Photo gallery URLs in display order. avatar is the cover. */
  gallery: string[];
  /** Profile view count (traction). */
  viewCount: number;
}

interface MapProviderRow {
  provider_id: string;
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
  last_active_at: string | null;
  rates_negotiable: boolean | null;
  gallery_urls: string[] | null;
  view_count: number | null;
  review_count: number | null;
  avg_rating: number | null;
}

export function mockToMapProvider(m: MockProvider): MapProvider {
  return {
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
    avatar: m.avatar,
    userId: m.userId,
    lastActiveAt: m.lastActiveAt,
    ratesNegotiable: m.ratesNegotiable,
    gallery: m.gallery,
    viewCount: m.viewCount,
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
    avatar: row.avatar_url || `https://i.pravatar.cc/600?img=${hashToImg(row.provider_id)}`,
    userId: row.provider_id,
    lastActiveAt: row.last_active_at,
    ratesNegotiable: row.rates_negotiable !== false,
    gallery: row.gallery_urls ?? [],
    viewCount: row.view_count ?? 0,
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
        'provider_id, display_name, avatar_url, is_verified, city, area_lat, area_lng, is_available, rate_short_time_ngn, rate_overnight_ngn, rate_weekend_ngn, services, last_active_at, rates_negotiable, gallery_urls, view_count, review_count, avg_rating',
      )
      .limit(300);
    if (error) throw error;
    const rows = (data ?? []) as MapProviderRow[];
    if (rows.length > 0) return rows.map(rowToMapProvider);
  } catch {
    // Fall through to mocks: map stays useful before migration / offline.
  }
  return MOCK_PROVIDERS.map(mockToMapProvider);
}
