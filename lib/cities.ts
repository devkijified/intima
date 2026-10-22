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

/** Admin-added city centres from settings, same [lat, lng] shape. */
export type CityCoordOverrides = Record<string, [number, number]>;

export function coordsFor(
  city: string,
  overrides?: CityCoordOverrides | null,
): [number, number] {
  return overrides?.[city] ?? cityCoords(city);
}
