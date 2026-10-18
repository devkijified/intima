// Provider service offerings: the determiners.
//
// What a provider offers decides the booking long before the fee is paid:
// video calls (SVC), dinner dates, threesomes and the rest are NOT offered
// by everyone, so each provider carries her own set. Catalog ids are stable
// and stored on profiles.services (text[]); labels stay discreet and
// platform-appropriate. Unknown ids from the database are ignored by the UI.

export type ServiceCategory = 'Calls' | 'Dates' | 'Experiences';

export interface ServiceDef {
  id: string;
  label: string;
  category: ServiceCategory;
}

export const SERVICE_CATEGORIES: ServiceCategory[] = ['Calls', 'Dates', 'Experiences'];

export const SERVICE_CATALOG: ServiceDef[] = [
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

const BY_ID: Record<string, ServiceDef> = Object.fromEntries(
  SERVICE_CATALOG.map((s) => [s.id, s]),
);

/** Resolve catalog ids to definitions, dropping anything unknown. */
export function resolveServices(ids: string[] | null | undefined): ServiceDef[] {
  if (!ids) return [];
  const seen = new Set<string>();
  const out: ServiceDef[] = [];
  for (const id of ids) {
    const def = BY_ID[id];
    if (def && !seen.has(id)) {
      seen.add(id);
      out.push(def);
    }
  }
  return out;
}

/** Group resolved services under their category headings, in catalog order. */
export function groupServices(ids: string[] | null | undefined): Array<{
  category: ServiceCategory;
  items: ServiceDef[];
}> {
  const resolved = resolveServices(ids);
  return SERVICE_CATEGORIES.map((category) => ({
    category,
    items: resolved.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0);
}

/** Display label for one catalog id, falling back to the raw id. */
export function serviceLabel(id: string): string {
  return BY_ID[id]?.label ?? id;
}
