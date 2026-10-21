// What a connection request is for.
//
// When a client requests a connection they pick the thing they
// actually want (a short time, an overnight, a dinner date) and the
// pick is stored on connections.service_type next to their offer
// (proposed_rate_ngn), so the companion sees intent and offer
// together and the negotiation starts from the right rate.
//
// The three priced rates on a profile (rate_short_time_ngn and
// friends) use the underscored keys; the rest reuse the service
// catalog ids from lib/services.ts. Anything a companion offers that
// has no key of its own is stored as 'other'.

export const SERVICE_TYPE_KEYS = [
  'short_time',
  'overnight',
  'weekend',
  'dinner-date',
  'travel',
  'video-call',
  'voice-call',
  'other',
] as const;

export type ServiceType = (typeof SERVICE_TYPE_KEYS)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  short_time: 'Short time',
  overnight: 'Overnight',
  weekend: 'Weekend',
  'dinner-date': 'Dinner date',
  travel: 'Travel',
  'video-call': 'Video call',
  'voice-call': 'Voice call',
  other: 'Something else',
};

/** Keys that correspond to a priced rate field on the profile. */
export const RATE_SERVICE_TYPES: ReadonlySet<string> = new Set([
  'short_time',
  'overnight',
  'weekend',
]);

export function isServiceType(value: unknown): value is ServiceType {
  return (
    typeof value === 'string' &&
    (SERVICE_TYPE_KEYS as readonly string[]).includes(value)
  );
}

/** Display label for a stored key, or null when there is no pick. */
export function serviceTypeLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return isServiceType(key) ? SERVICE_TYPE_LABELS[key] : null;
}

/**
 * Map a profile service slug (lib/services catalog id) to the
 * storable service_type key. Catalog ids that are keys themselves
 * pass through; everything else (massage, GFE, party) lands on
 * 'other' rather than inventing a key the database would reject.
 */
export function serviceTypeForSlug(slug: string): ServiceType {
  return isServiceType(slug) ? slug : 'other';
}
