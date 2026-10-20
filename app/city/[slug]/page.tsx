import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, Star } from '@/lib/icons';
import { NIGERIA_CITIES } from '@/lib/cities';
import { createClient } from '@/lib/supabase/server';

const BASE_URL = 'https://intima-snowy.vercel.app';

/** Slug for a city name: lowercase, spaces to hyphens, punctuation stripped. */
function cityToSlug(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function cityFromSlug(slug: string): string | null {
  const match = NIGERIA_CITIES.find((c) => cityToSlug(c) === slug.toLowerCase());
  return match ?? null;
}

export function generateStaticParams() {
  return NIGERIA_CITIES.map((city) => ({ slug: cityToSlug(city) }));
}

interface CityProviderRow {
  provider_id: string;
  display_name: string | null;
  avatar_url: string | null;
  city: string;
  is_available: boolean | null;
  avg_rating: number | null;
  review_count: number | null;
  booking_count: number | null;
  username: string | null;
  travel_cities: string[] | null;
  travel_mode: string | null;
}

/**
 * City matching predicate. This mirrors the map filter in
 * components/map/IntimaMap.tsx (home city, travel_cities, nationwide).
 * It is duplicated here with intent: lib/map/providers.ts is bound to
 * the browser Supabase client and the mock fallback, so it cannot be
 * imported into a server component. Keep the two in step.
 * The map also matches an active tour city; the public view queried
 * here does not carry tour data, so tours are not matched on this page.
 */
function providerServesCity(row: CityProviderRow, city: string): boolean {
  return (
    row.city === city ||
    (row.travel_cities ?? []).includes(city) ||
    row.travel_mode === 'nationwide'
  );
}

async function fetchCityProviders(city: string): Promise<CityProviderRow[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('map_providers')
      .select(
        'provider_id, display_name, avatar_url, city, is_available, avg_rating, review_count, booking_count, username, travel_cities, travel_mode',
      )
      .limit(300);
    if (error) throw error;
    return ((data ?? []) as CityProviderRow[]).filter((row) => providerServesCity(row, city));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const city = cityFromSlug(params.slug);
  if (!city) {
    return { title: 'Intima: Verified Companions in Nigeria' };
  }
  const title = `Companions in ${city} | Intima`;
  const description = `Verified companions in ${city}. Browse profiles, ratings and availability, and book direct on Intima with no agents and no middlemen.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BASE_URL}/city/${cityToSlug(city)}`,
    },
    twitter: { card: 'summary', title, description },
  };
}

export default async function CityPage({ params }: { params: { slug: string } }) {
  const city = cityFromSlug(params.slug);
  if (!city) notFound();

  const providers = await fetchCityProviders(city);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Companions in ${city}`,
    itemListElement: providers.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: p.display_name || 'Intima companion',
      url: `${BASE_URL}/companion/${p.username ?? p.provider_id}`,
    })),
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-6 md:pb-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Intima</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-charcoal">
        Companions in {city}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-500">
        Verified companions based in {city} and companions visiting {city}. Every profile is
        ID checked. Book direct, with no agents and no middlemen.
      </p>

      {providers.length === 0 ? (
        <div className="card-luxe mt-8 p-10 text-center">
          <p className="font-medium text-charcoal">No verified companions listed in {city} yet.</p>
          <p className="mt-1 text-sm text-neutral-500">
            New companions join regularly. Check the map for who is nearby.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white"
          >
            Back to map
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {providers.map((p) => {
            const basedIn = p.city === city;
            const href = `/companion/${p.username ?? p.provider_id}`;
            const name = p.display_name || 'Intima companion';
            return (
              <Link
                key={p.provider_id}
                href={href}
                className="card-luxe block overflow-hidden transition-all active:scale-[0.99]"
              >
                <div className="relative aspect-[3/4] bg-neutral-100">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt={name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-cream font-display text-4xl text-neutral-400">
                      {(name[0] ?? '?').toUpperCase()}
                    </span>
                  )}
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${p.is_available ? 'bg-green-400' : 'bg-neutral-400'}`}
                    />
                    {p.is_available ? 'Available' : 'Unavailable'}
                  </span>
                </div>
                <div className="p-3">
                  <p className="flex items-center gap-1 truncate text-sm font-semibold text-charcoal">
                    {name}
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {p.avg_rating !== null ? p.avg_rating.toFixed(1) : 'New'}
                    <span>({p.review_count ?? 0} reviews)</span>
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {p.booking_count ?? 0} bookings
                  </p>
                  <p className="mt-1.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        basedIn ? 'bg-primary-muted text-primary' : 'bg-secondary-muted text-charcoal'
                      }`}
                    >
                      {basedIn ? `Based in ${city}` : `Visiting ${city}`}
                    </span>
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-xs text-neutral-500">
        Area location only, never an exact address. You must be 18 or older to use Intima.
      </p>
    </div>
  );
}
