'use client';

import { useEffect, useState } from 'react';
import { getSetting } from '@/lib/settings/platformSettings';
import {
  NIGERIA_CITIES,
  type CityCoordOverrides,
} from '@/lib/cities';

function saneCities(value: unknown): string[] {
  if (!Array.isArray(value)) return [...NIGERIA_CITIES];
  const list = value
    .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    .map((c) => c.trim());
  return list.length > 0 ? list : [...NIGERIA_CITIES];
}

function saneCoords(value: unknown): CityCoordOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: CityCoordOverrides = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (
      Array.isArray(v) && v.length === 2 &&
      typeof v[0] === 'number' && typeof v[1] === 'number'
    ) {
      out[k] = [v[0], v[1]];
    }
  }
  return out;
}

/**
 * The live city list + any admin-added centres, from the
 * admin-editable platform settings. Defaults render instantly;
 * the saved settings replace them when they arrive.
 */
export function useCities(): {
  cities: string[];
  coordOverrides: CityCoordOverrides;
  loaded: boolean;
} {
  const [cities, setCities] = useState<string[]>([...NIGERIA_CITIES]);
  const [coordOverrides, setCoordOverrides] = useState<CityCoordOverrides>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const [savedCities, savedCoords] = await Promise.all([
        getSetting<unknown>('cities', null),
        getSetting<unknown>('city_coords', null),
      ]);
      if (!live) return;
      setCities(saneCities(savedCities));
      setCoordOverrides(saneCoords(savedCoords));
      setLoaded(true);
    })();
    return () => { live = false; };
  }, []);

  return { cities, coordOverrides, loaded };
}
