/** Nigerian cities Intima operates in, with approximate centers for pins. */
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
