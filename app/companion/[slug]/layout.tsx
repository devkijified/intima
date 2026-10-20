import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

/**
 * Server layout for companion pages: its only job is rich link
 * previews. WhatsApp, Telegram and X read these tags server-side, so a
 * shared companion link shows her name, city and photo instead of a
 * blank generic card.
 */
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const fallback: Metadata = {
    title: 'Intima: Verified Companions in Nigeria',
    description: 'Verified companions, direct booking, no agents. Where Elegance Meets Connection.',
  };
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.slug);
    const query = supabase
      .from('profiles')
      .select('id, display_name, avatar_url, bio, is_verified');
    const { data } = await (isUuid
      ? query.eq('id', params.slug)
      : query.eq('username', params.slug)
    ).maybeSingle();
    if (!data?.display_name) return fallback;

    let city: string | undefined;
    if (data.id) {
      const { data: presence } = await supabase
        .from('provider_presence')
        .select('city')
        .eq('provider_id', data.id as string)
        .maybeSingle();
      city = (presence as { city?: string } | null)?.city;
    }

    const name = data.display_name as string;
    const title = `${name}${data.is_verified ? ' ✓' : ''} on Intima`;
    const description =
      (data.bio as string | null)?.slice(0, 140) ??
      `Verified companion${city ? ` in ${city}` : ''}. Book direct on Intima, no agents, no middlemen.`;
    const images = data.avatar_url ? [{ url: data.avatar_url as string }] : undefined;
    return {
      title,
      description,
      openGraph: { title, description, images, type: 'profile' },
      twitter: { card: 'summary_large_image', title, description, images: images?.map((i) => i.url) },
    };
  } catch {
    return fallback;
  }
}

export default function CompanionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
