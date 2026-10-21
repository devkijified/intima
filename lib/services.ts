// Provider service offerings: the determiners.
//
// What a provider offers decides the booking long before the fee is paid:
// video calls (SVC), dinner dates, threesomes and the rest are NOT offered
// by everyone, so each provider carries her own set. Catalog ids are stable
// and stored on profiles.services (text[]); labels stay discreet and
// platform-appropriate.
//
// Companions can also offer things the catalog does not list. Those
// custom entries live in the same profiles.services array, stored as
// "custom:" in front of the display text she typed (for example
// "custom:Piano serenade"). They are display-only: they never join the
// filter chips, and they never enable call buttons, which key off the
// preset 'voice-call' / 'video-call' slugs only. Every label in the app
// resolves through the helpers in this file, so a custom entry shows
// its own text everywhere and never its raw storage value.

export type ServiceCategory = 'Calls' | 'Dates' | 'Experiences';

/** Display groups a resolved service can land in: catalog categories plus the custom bucket. */
export type ServiceGroupCategory = ServiceCategory | 'Custom';

export interface ServiceDef {
  id: string;
  label: string;
  category: ServiceGroupCategory;
  /** True when the entry is a companion's own service rather than a catalog item. */
  custom?: boolean;
}

export const SERVICE_CATEGORIES: ServiceCategory[] = ['Calls', 'Dates', 'Experiences'];

export const SERVICE_CATALOG: Array<ServiceDef & { category: ServiceCategory }> = [
  // Calls
  { id: 'video-call', label: 'Video call (SVC)', category: 'Calls' },
  { id: 'voice-call', label: 'Voice call', category: 'Calls' },
  // Dates
  { id: 'dinner-date', label: 'Dinner date', category: 'Dates' },
  { id: 'gfe', label: 'Girlfriend experience (GFE)', category: 'Dates' },
  { id: 'overnight', label: 'Overnight companion', category: 'Dates' },
  { id: 'weekend', label: 'Weekend getaway', category: 'Dates' },
  { id: 'party', label: 'Party companion', category: 'Dates' },
  { id: 'couples', label: 'Couples', category: 'Dates' },
  // Experiences
  { id: 'massage', label: 'Massage', category: 'Experiences' },
  { id: 'threesome-ffm', label: 'Threesome (FFM)', category: 'Experiences' },
  { id: 'threesome-mmf', label: 'Threesome (MMF)', category: 'Experiences' },
  { id: 'travel', label: 'Travel companion', category: 'Experiences' },
  { id: 'social-event', label: 'Social event companion', category: 'Experiences' },
  { id: 'photo-video', label: 'Photo/video session', category: 'Experiences' },
];

// ---- Custom services (companion-typed, beyond the catalog) ----

export const CUSTOM_SERVICE_PREFIX = 'custom:';
export const MAX_CUSTOM_SERVICES = 5;
export const CUSTOM_SERVICE_MIN_LENGTH = 2;
export const CUSTOM_SERVICE_MAX_LENGTH = 40;

export function isCustomService(id: string): boolean {
  return typeof id === 'string' && id.startsWith(CUSTOM_SERVICE_PREFIX);
}

/** The display text of a custom entry: the part after the "custom:" prefix. */
export function customServiceText(id: string): string {
  return isCustomService(id) ? id.slice(CUSTOM_SERVICE_PREFIX.length) : id;
}

/** Storage value for a companion-typed custom service. */
export function makeCustomServiceId(text: string): string {
  return `${CUSTOM_SERVICE_PREFIX}${text.trim()}`;
}

const normText = (s: string) => s.trim().toLowerCase();

/**
 * Check a companion-typed custom service against the house rules:
 * length, the per-profile cap of custom entries, and duplicates
 * against catalog labels and her existing custom entries (all
 * compared case-insensitively). Returns a user-facing problem
 * string, or null when the text may be added. The contact-leak
 * scan (lib/moderation/contactCheck) runs separately in the
 * editor before this check: the fence comes first.
 */
export function customServiceProblem(
  text: string,
  existingServices: string[] | null | undefined,
): string | null {
  const t = text.trim();
  if (!t) return 'Type the service you want to add first.';
  if (t.length < CUSTOM_SERVICE_MIN_LENGTH || t.length > CUSTOM_SERVICE_MAX_LENGTH) {
    return `Keep it between ${CUSTOM_SERVICE_MIN_LENGTH} and ${CUSTOM_SERVICE_MAX_LENGTH} characters.`;
  }
  const existing = existingServices ?? [];
  const customs = existing.filter(isCustomService);
  if (customs.length >= MAX_CUSTOM_SERVICES) {
    return `You can add up to ${MAX_CUSTOM_SERVICES} of your own services. Remove one to add another.`;
  }
  if (SERVICE_CATALOG.some((s) => normText(s.label) === normText(t))) {
    return 'That one is already on the list above. Just tap it to add it.';
  }
  if (customs.some((c) => normText(customServiceText(c)) === normText(t))) {
    return 'You already added that service.';
  }
  return null;
}

const BY_ID: Record<string, ServiceDef> = Object.fromEntries(
  SERVICE_CATALOG.map((s) => [s.id, s]),
);

/**
 * Resolve stored service values to display definitions. Catalog ids
 * resolve to the catalog; "custom:" entries resolve to the text the
 * companion typed; anything else unknown is dropped.
 */
export function resolveServices(ids: string[] | null | undefined): ServiceDef[] {
  if (!ids) return [];
  const seen = new Set<string>();
  const out: ServiceDef[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    if (isCustomService(id)) {
      const label = customServiceText(id).trim();
      if (!label) continue;
      seen.add(id);
      out.push({ id, label, category: 'Custom', custom: true });
      continue;
    }
    const def = BY_ID[id];
    if (def) {
      seen.add(id);
      out.push(def);
    }
  }
  return out;
}

/** Group resolved services under their category headings, in catalog order, with custom entries last. */
export function groupServices(ids: string[] | null | undefined): Array<{
  category: ServiceGroupCategory;
  items: ServiceDef[];
}> {
  const resolved = resolveServices(ids);
  const groups = SERVICE_CATEGORIES.map((category) => ({
    category: category as ServiceGroupCategory,
    items: resolved.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0);
  const customs = resolved.filter((s) => s.custom);
  if (customs.length > 0) {
    groups.push({ category: 'Custom', items: customs });
  }
  return groups;
}

/** Display label for one stored value: the typed text for custom entries, the catalog label otherwise, the raw value as the last fallback. */
export function serviceLabel(id: string): string {
  if (isCustomService(id)) return customServiceText(id);
  return BY_ID[id]?.label ?? id;
}
