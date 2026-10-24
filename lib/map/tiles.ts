/**
 * Map base providers and place search.
 *
 * The chain is proof-driven (see IntimaMap): a stage only counts
 * as working once one of its tiles has genuinely loaded on the
 * device; otherwise the map steps down to the next stage and
 * finally to the honest list. A prettier base that stays black
 * on real networks is worse than a plain base that paints.
 *
 * Stage order:
 *  1. MapTiler vector tiles (streets-v2-dark), ONLY when
 *     NEXT_PUBLIC_MAPTILER_KEY is set. Vector tiles plus a real
 *     dark style: crisp at every zoom and no CSS filter needed.
 *     The key is a public browser key: restrict it to the app
 *     domains in the MapTiler dashboard. Setting it needs a
 *     redeploy (NEXT_PUBLIC_ vars are build-time).
 *  2. Wikimedia raster tiles (OpenStreetMap data) under the
 *     dark CSS filter. Plain image tiles on highly reachable
 *     infrastructure; the filter makes them read as the dark
 *     slate night base.
 *  3. OpenStreetMap's own raster tiles, same filter.
 *
 * Two dead ends already walked, do not re-add them: the CARTO
 * vector style (its tile and glyph chain stalls on the networks
 * that matter here) and CARTO's keyless dark_all raster (the
 * tiles arrive watermarked "API KEY REQUIRED").
 */

export interface BaseStage {
  /** A style object, or a style JSON URL for hosted styles. */
  style: unknown;
  /** GeoJSON/raster source id whose loaded tile proves the
      stage. Null for hosted URL styles: any loaded tile proves
      them (their source names are the provider's, not ours). */
  sourceId: string | null;
  /** True when the stage needs the dark CSS filter (rasters). */
  filtered: boolean;
}

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

export const WIKIMEDIA_RASTER_STYLE = {
  version: 8 as const,
  sources: {
    wikimedia: {
      type: 'raster' as const,
      tiles: ['https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'wikimedia', type: 'raster' as const, source: 'wikimedia' }],
};

export const OSM_RASTER_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

/** The base chain for this build, best first. */
export function buildBaseStages(): BaseStage[] {
  const stages: BaseStage[] = [];
  if (MAPTILER_KEY) {
    stages.push({
      style: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`,
      sourceId: null,
      filtered: false,
    });
  }
  stages.push({ style: WIKIMEDIA_RASTER_STYLE, sourceId: 'wikimedia', filtered: true });
  stages.push({ style: OSM_RASTER_STYLE, sourceId: 'osm', filtered: true });
  return stages;
}

/** True when a hosted place-search provider is configured. */
export const hasPlaceSearch = MAPTILER_KEY.length > 0;

export interface PlaceResult {
  label: string;
  detail: string;
  lng: number;
  lat: number;
}

/**
 * Place search via MapTiler Geocoding (real places, needs the
 * key above). Resolves to an empty list when unconfigured so
 * callers can merge it with local results unconditionally;
 * throws on a failed request so the UI can say so honestly.
 */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (!MAPTILER_KEY || q.length < 3) return [];
  const res = await fetch(
    `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${MAPTILER_KEY}&limit=5&language=en`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) throw new Error(`place search ${res.status}`);
  const j = (await res.json()) as {
    features?: Array<{ place_name?: string; text?: string; center?: [number, number] }>;
  };
  return (j.features ?? [])
    .filter((f) => Array.isArray(f.center))
    .map((f) => ({
      label: f.text ?? f.place_name ?? 'Place',
      detail: f.place_name ?? '',
      lng: (f.center as [number, number])[0],
      lat: (f.center as [number, number])[1],
    }));
}
