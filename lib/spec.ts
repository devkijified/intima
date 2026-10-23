/**
 * The spec: the structured answer to the question every agent
 * asks, "what is your spec?" A companion declares hers once on her
 * profile from these fixed vocabularies; a client filters the map
 * by the same words. Fixed choices only, never free text, so a
 * spec can never smuggle contact details around the connection
 * fee, and so filters and profiles always speak the same language.
 *
 * Every label lives here and only here: if a word is not how
 * users say it, this file is the one place to change it.
 */

export interface SpecOption {
  id: string;
  label: string;
}

export const SPEC_COMPLEXIONS: SpecOption[] = [
  { id: 'fair', label: 'Fair' },
  { id: 'caramel', label: 'Caramel' },
  { id: 'chocolate', label: 'Chocolate' },
  { id: 'ebony', label: 'Ebony' },
];

export const SPEC_BODY_TYPES: SpecOption[] = [
  { id: 'petite', label: 'Petite' },
  { id: 'slim', label: 'Slim' },
  { id: 'curvy', label: 'Curvy' },
  { id: 'thick', label: 'Thick' },
  { id: 'plus-size', label: 'Plus size' },
];

export const SPEC_HEIGHTS: SpecOption[] = [
  { id: 'short', label: 'Short' },
  { id: 'average', label: 'Average height' },
  { id: 'tall', label: 'Tall' },
];

export const SPEC_TAGS: SpecOption[] = [
  { id: 'hourglass', label: 'Hourglass' },
  { id: 'busty', label: 'Busty' },
  { id: 'big-butt', label: 'Big butt' },
  { id: 'long-legs', label: 'Long legs' },
  { id: 'toned', label: 'Toned' },
  { id: 'flat-tummy', label: 'Flat tummy' },
];

export const MAX_SPEC_TAGS = 4;

/** What one companion declares. Null or empty means unset. */
export interface SpecValues {
  complexion: string | null;
  bodyType: string | null;
  height: string | null;
  tags: string[];
}

/** What a client picks in the filter sheet. Multi-select per group. */
export interface SpecFilter {
  complexions: string[];
  bodyTypes: string[];
  heights: string[];
  tags: string[];
}

export function emptySpecFilter(): SpecFilter {
  return { complexions: [], bodyTypes: [], heights: [], tags: [] };
}

export function specFilterActive(f: SpecFilter): boolean {
  return (
    f.complexions.length > 0 ||
    f.bodyTypes.length > 0 ||
    f.heights.length > 0 ||
    f.tags.length > 0
  );
}

function labelOf(options: SpecOption[], id: string | null | undefined): string | null {
  if (!id) return null;
  return options.find((o) => o.id === id)?.label ?? null;
}

/** Display chips for a companion's spec, in reading order. */
export function specChips(v: SpecValues): string[] {
  const out: string[] = [];
  const c = labelOf(SPEC_COMPLEXIONS, v.complexion);
  if (c) out.push(c);
  const b = labelOf(SPEC_BODY_TYPES, v.bodyType);
  if (b) out.push(b);
  const h = labelOf(SPEC_HEIGHTS, v.height);
  if (h) out.push(h);
  for (const t of v.tags) {
    const l = labelOf(SPEC_TAGS, t);
    if (l) out.push(l);
  }
  return out;
}

export function hasSpec(v: SpecValues): boolean {
  return specChips(v).length > 0;
}

/**
 * Filter logic, mirroring the way the rest of the sheet reads:
 * choices inside one group are alternatives (OR), groups combine
 * (AND), and every selected figure tag must be present (AND).
 * A companion who has not set a value never matches a group that
 * has selections.
 */
export function matchesSpec(v: SpecValues, f: SpecFilter): boolean {
  if (f.complexions.length > 0 && (!v.complexion || !f.complexions.includes(v.complexion))) {
    return false;
  }
  if (f.bodyTypes.length > 0 && (!v.bodyType || !f.bodyTypes.includes(v.bodyType))) {
    return false;
  }
  if (f.heights.length > 0 && (!v.height || !f.heights.includes(v.height))) {
    return false;
  }
  if (f.tags.length > 0 && !f.tags.every((t) => v.tags.includes(t))) {
    return false;
  }
  return true;
}

/** Keep only vocabulary ids, for save and load paths. */
export function cleanSpec(v: SpecValues): SpecValues {
  const keep = (options: SpecOption[], id: string | null) =>
    id && options.some((o) => o.id === id) ? id : null;
  return {
    complexion: keep(SPEC_COMPLEXIONS, v.complexion),
    bodyType: keep(SPEC_BODY_TYPES, v.bodyType),
    height: keep(SPEC_HEIGHTS, v.height),
    tags: (v.tags ?? []).filter((t) => SPEC_TAGS.some((o) => o.id === t)).slice(0, MAX_SPEC_TAGS),
  };
}
