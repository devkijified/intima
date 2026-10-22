import type { Metadata } from 'next';
import { SITE_URL, metaDescription, publicAnonClient } from '@/lib/seo';

/**
 * Server layout for companion pages: rich link previews plus
 * structured data. WhatsApp, Telegram and X read these tags
 * server-side, so a shared companion link shows her name, city and
 * photo instead of a blank generic card, and search engines get a
 * tasteful Person record (name, photo, page, city, nothing more).
 */

interface CompanionSeo {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean | null;
  city?: string;
}

async function loadCompanion(slug: string): Promise<CompanionSeo | null> {
  try {
    const supabase = publicAnonClient();
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    const query = supabase
      .from('profiles')
      .select('id, display_name, avatar_url, bio, is_verified');
    const { data } = await (isUuid
      ? query.eq('id', slug)
      : query.eq('username', slug)
    ).maybeSingle();
    if (!data?.display_name) return null;

    let city: string | undefined;
    if (data.id) {
      const { data: presence } = await supabase
        .from('provider_presence')
        .select('city')
        .eq('provider_id', data.id as string)
        .maybeSingle();
      city = (presence as { city?: string } | null)?.city;
    }
    return { ...(data as Omit<CompanionSeo, 'city'>), city };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const fallback: Metadata = {
    title: { absolute: 'Verified Companion · Intima' },
    description:
      'The premier platform for verified companions. Book direct on Intima, no agents, no middlemen.',
  };
  const data = await loadCompanion(params.slug);
  if (!data) return fallback;

  const name = data.display_name;
  // Absolute title: the root template would otherwise double the suffix.
  const title = `${name} · Intima`;
  const description = metaDescription(
    data.bio,
    `Verified companion${data.city ? ` in ${data.city}` : ''}. Book direct on Intima, no agents, no middlemen.`
  );
  const images = data.avatar_url ? [{ url: data.avatar_url }] : undefined;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/companion/${params.slug}` },
    openGraph: { title, description, images, type: 'profile' },
    twitter: { card: 'summary_large_image', title, description, images: images?.map((i) => i.url) },
  };
}

export default async function CompanionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const data = await loadCompanion(params.slug);
  const person = data
    ? {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: data.display_name,
        ...(data.avatar_url ? { image: data.avatar_url } : {}),
        url: `${SITE_URL}/companion/${params.slug}`,
        ...(data.city
          ? { homeLocation: { '@type': 'Place', name: data.city } }
          : {}),
      }
    : null;
  return (
    <>
      {person && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(person) }}
        />
      )}
      {children}
    </>
  );
}
