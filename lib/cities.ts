/**
 * Cities Intima operates in. The built-in list below is the
 * default; the live list is admin-editable in Admin, Services and
 * cities (platform_settings key 'cities'), so a new city opens by
 * adding it there, never by shipping code. Client readers use
 * useCities() from lib/citiesLive; this module stays pure so
 * server code (board API, sitemap, city pages) can import it too.
 */
export const NIGERIA_CITIES = [
  'Lagos',
  'Abuja',
  'Port Harcourt',
  'Ibadan',
  'Enugu',
  'Benin City',
  'Kano',
] as const;

export type NigeriaCity = (typeof NIGERIA_CITIES)[number];

/** [lat, lng] approximate city centers (area-level pins, never exact). */
export const CITY_COORDS: Record<string, [number, number]> = {
  Lagos: [6.5244, 3.3792],
  Abuja: [9.0579, 7.4951],
  'Port Harcourt': [4.7714, 6.9962],
  Ibadan: [7.3775, 3.947],
  Enugu: [6.4584, 7.4951],
  'Benin City': [6.335, 5.603],
  Kano: [12.0022, 8.5167],
};

export function cityCoords(city: string): [number, number] {
  return CITY_COORDS[city] ?? CITY_COORDS.Lagos;
}

/**
 * Wider gazetteer of Nigerian city centres, used by the admin city
 * editor to fill coordinates automatically when a known city is
 * added. Approximate centres only (area-level pins, never exact).
 * The operating list stays NIGERIA_CITIES plus admin additions;
 * this map only answers "where is this place".
 */
export const GAZETTEER_COORDS: Record<string, [number, number]> = {
  ...CITY_COORDS,
  Aba: [5.1167, 7.3667],
  Abakaliki: [6.3249, 8.1137],
  Abeokuta: [7.1475, 3.3619],
  'Ado Ekiti': [7.6211, 5.2214],
  Akure: [7.2526, 5.1931],
  Asaba: [6.1986, 6.7328],
  Awka: [6.2109, 7.0741],
  Bauchi: [10.3103, 9.8439],
  Calabar: [4.9757, 8.3417],
  Gombe: [10.2897, 11.1713],
  Gusau: [12.1699, 6.6656],
  Ilorin: [8.4799, 4.5418],
  Jos: [9.9285, 8.8921],
  Kaduna: [10.5105, 7.4165],
  Katsina: [12.9908, 7.6006],
  Lafia: [8.5089, 8.5229],
  Lokoja: [7.8006, 6.7337],
  Maiduguri: [11.8311, 13.151],
  Makurdi: [7.7338, 8.5214],
  Minna: [9.6139, 6.5569],
  Onitsha: [6.1498, 6.7857],
  Osogbo: [7.7727, 4.5531],
  Owerri: [5.4891, 7.0176],
  Sokoto: [13.0629, 5.2432],
  Umuahia: [5.5249, 7.4946],
  Uyo: [5.0377, 7.9128],
  Warri: [5.5174, 5.7566],
  Yenagoa: [4.9319, 6.2649],
  Yola: [9.2035, 12.4954],
  Zaria: [11.0855, 7.7199],
};

/** Case-insensitive gazetteer lookup; null when the place is unknown. */
export function gazetteerCoords(name: string): [number, number] | null {
  const want = name.trim().toLowerCase();
  if (!want) return null;
  for (const [city, coords] of Object.entries(GAZETTEER_COORDS)) {
    if (city.toLowerCase() === want) return coords;
  }
  return null;
}

/** Admin-added city centres from settings, same [lat, lng] shape. */
export type CityCoordOverrides = Record<string, [number, number]>;

export function coordsFor(
  city: string,
  overrides?: CityCoordOverrides | null,
): [number, number] {
  return overrides?.[city] ?? cityCoords(city);
}
