// Mock provider pins for the Intima Map.
//
// Privacy by design: coordinates are AREA level only. Each pin is jittered
// around a neighbourhood centre (Lekki, Victoria Island, Ikoyi, Yaba,
// Surulere, Ikeja, Maitama, Wuse 2, GRA). Exact addresses are never shown.
//
// Production path: pins come from the provider_presence table
// (supabase/migrations/002_map_calls.sql) filtered to show_on_map = true,
// which is strictly opt in. Mock rows carry userId: null, so the voice and
// video call buttons render disabled with an explanatory tooltip until the
// verification launch wires real auth users.

export type MapCity = 'Lagos' | 'Abuja' | 'Port Harcourt' | 'Ibadan' | 'Enugu';

export const MAP_CITIES: MapCity[] = ['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Enugu'];

export interface MockProvider {
  id: string;
  displayName: string;
  age: number;
  city: MapCity;
  area: string;
  lat: number;
  lng: number;
  verified: boolean;
  available: boolean;
  rating: number;
  reviewCount: number;
  ratePerHour: number; // naira
  // Rate card in naira, shown before any connection fee is paid.
  // null = not listed yet (the sheet says so instead of hiding).
  rateShortTime: number | null;
  rateOvernight: number | null;
  rateWeekend: number | null;
  avatar: string;
  userId: null;
  /** Catalog ids from lib/services.ts. Deliberately varied: not everyone
      offers video calls or threesomes, and one provider lists nothing. */
  services: string[];
  /** ISO timestamp for the recency chip. Deliberately varied. */
  lastActiveAt: string;
}

function jitter(base: number, spread = 0.012): number {
  return base + (Math.random() - 0.5) * 2 * spread;
}

/** ISO timestamp N hours ago, for varied recency chips in mocks. */
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

interface PinSeed {
  id: string;
  displayName: string;
  age: number;
  city: MapCity;
  area: string;
  baseLat: number;
  baseLng: number;
  verified: boolean;
  available: boolean;
  rating: number;
  reviewCount: number;
  ratePerHour: number;
  rateShortTime: number | null;
  rateOvernight: number | null;
  rateWeekend: number | null;
  img: number;
  services: string[];
}

const SEEDS: PinSeed[] = [
  { id: 'mock-01', displayName: 'Adaeze', age: 24, city: 'Lagos', area: 'Lekki', baseLat: 6.4584, baseLng: 3.6015, verified: true, available: true, rating: 4.9, reviewCount: 132, ratePerHour: 75000, rateShortTime: 150000, rateOvernight: 400000, rateWeekend: 900000, img: 47,
    services: ['video-call', 'voice-call', 'dinner-date', 'gfe', 'overnight', 'weekend', 'massage', 'travel'] },
  { id: 'mock-02', displayName: 'Zainab', age: 26, city: 'Lagos', area: 'Victoria Island', baseLat: 6.4281, baseLng: 3.4219, verified: true, available: true, rating: 4.8, reviewCount: 98, ratePerHour: 100000, rateShortTime: 200000, rateOvernight: 500000, rateWeekend: 1200000, img: 32,
    services: ['video-call', 'dinner-date', 'overnight', 'party', 'social-event'] },
  { id: 'mock-03', displayName: 'Funke', age: 23, city: 'Lagos', area: 'Ikoyi', baseLat: 6.4541, baseLng: 3.439, verified: true, available: false, rating: 5.0, reviewCount: 210, ratePerHour: 150000, rateShortTime: 300000, rateOvernight: 800000, rateWeekend: 1800000, img: 45,
    services: ['video-call', 'voice-call', 'dinner-date', 'gfe', 'overnight', 'weekend', 'threesome-ffm', 'travel', 'photo-video'] },
  { id: 'mock-04', displayName: 'Ngozi', age: 25, city: 'Lagos', area: 'Yaba', baseLat: 6.5167, baseLng: 3.3792, verified: false, available: true, rating: 4.4, reviewCount: 37, ratePerHour: 35000, rateShortTime: 80000, rateOvernight: 200000, rateWeekend: 450000, img: 26,
    services: ['voice-call', 'dinner-date', 'massage'] },
  { id: 'mock-05', displayName: 'Tolu', age: 27, city: 'Lagos', area: 'Surulere', baseLat: 6.4969, baseLng: 3.3551, verified: true, available: true, rating: 4.7, reviewCount: 64, ratePerHour: 50000, rateShortTime: 120000, rateOvernight: 300000, rateWeekend: 650000, img: 12,
    services: ['video-call', 'dinner-date', 'overnight', 'party'] },
  // mock-06 exercises the empty state: rates and services not listed yet.
  { id: 'mock-06', displayName: 'Kemi', age: 24, city: 'Lagos', area: 'Ikeja', baseLat: 6.6018, baseLng: 3.3515, verified: false, available: true, rating: 4.2, reviewCount: 19, ratePerHour: 30000, rateShortTime: null, rateOvernight: null, rateWeekend: null, img: 44,
    services: [] },
  { id: 'mock-07', displayName: 'Chiamaka', age: 26, city: 'Lagos', area: 'Lekki', baseLat: 6.452, baseLng: 3.612, verified: true, available: true, rating: 4.9, reviewCount: 156, ratePerHour: 85000, rateShortTime: 180000, rateOvernight: 450000, rateWeekend: 1000000, img: 31,
    services: ['video-call', 'voice-call', 'dinner-date', 'gfe', 'overnight', 'threesome-mmf', 'massage'] },
  { id: 'mock-08', displayName: 'Yetunde', age: 28, city: 'Lagos', area: 'Ikeja', baseLat: 6.608, baseLng: 3.342, verified: true, available: false, rating: 4.6, reviewCount: 88, ratePerHour: 60000, rateShortTime: 150000, rateOvernight: 350000, rateWeekend: 800000, img: 25,
    services: ['dinner-date', 'overnight', 'weekend', 'travel'] },
  { id: 'mock-09', displayName: 'Amina', age: 25, city: 'Abuja', area: 'Maitama', baseLat: 9.0833, baseLng: 7.4833, verified: true, available: true, rating: 4.8, reviewCount: 74, ratePerHour: 90000, rateShortTime: 200000, rateOvernight: 500000, rateWeekend: 1100000, img: 16,
    services: ['video-call', 'voice-call', 'dinner-date', 'overnight', 'couples', 'social-event'] },
  { id: 'mock-10', displayName: 'Blessing', age: 23, city: 'Abuja', area: 'Wuse 2', baseLat: 9.0667, baseLng: 7.4667, verified: false, available: true, rating: 4.3, reviewCount: 22, ratePerHour: 40000, rateShortTime: 100000, rateOvernight: 250000, rateWeekend: 550000, img: 49,
    services: ['voice-call', 'dinner-date'] },
  { id: 'mock-11', displayName: 'Fatima', age: 27, city: 'Port Harcourt', area: 'GRA', baseLat: 4.8156, baseLng: 7.0498, verified: true, available: true, rating: 4.7, reviewCount: 51, ratePerHour: 55000, rateShortTime: 130000, rateOvernight: 320000, rateWeekend: 700000, img: 20,
    services: ['video-call', 'dinner-date', 'overnight', 'massage', 'party'] },
  { id: 'mock-12', displayName: 'Ifunanya', age: 24, city: 'Port Harcourt', area: 'Peter Odili', baseLat: 4.8, baseLng: 7.0333, verified: false, available: false, rating: 4.5, reviewCount: 29, ratePerHour: 45000, rateShortTime: 110000, rateOvernight: 280000, rateWeekend: 600000, img: 38,
    services: ['voice-call', 'massage', 'party', 'threesome-ffm'] },
];

const RECENCY_HOURS: Record<string, number> = {
  'mock-01': 2,
  'mock-02': 5,
  'mock-03': 26,
  'mock-04': 70,
  'mock-05': 6,
  'mock-06': 30,
  'mock-07': 1,
  'mock-08': 96,
  'mock-09': 8,
  'mock-10': 50,
  'mock-11': 12,
  'mock-12': 55,
};

export const MOCK_PROVIDERS: MockProvider[] = SEEDS.map((s) => ({
  id: s.id,
  displayName: s.displayName,
  age: s.age,
  city: s.city,
  area: s.area,
  lat: jitter(s.baseLat),
  lng: jitter(s.baseLng),
  verified: s.verified,
  available: s.available,
  rating: s.rating,
  reviewCount: s.reviewCount,
  ratePerHour: s.ratePerHour,
  rateShortTime: s.rateShortTime,
  rateOvernight: s.rateOvernight,
  rateWeekend: s.rateWeekend,
  avatar: `https://i.pravatar.cc/600?img=${s.img}`,
  userId: null,
  services: s.services,
  lastActiveAt: hoursAgo(RECENCY_HOURS[s.id] ?? 24),
}));
