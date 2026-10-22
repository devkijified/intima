import type { Metadata } from 'next';
import { metaDescription, publicAnonClient } from '@/lib/seo';

/**
 * Server layout for one comic series: link previews and search
 * metadata only (title, the story so far, the cover). The page
 * itself stays the client storybook.
 */
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const fallback: Metadata = {
    title: 'Comics',
    description: 'Stories in episodes, free to read on Intima.',
  };
  try {
    const supabase = publicAnonClient();
    const { data } = await supabase
      .from('comics')
      .select('title, synopsis, cover_url')
      .eq('id', params.id)
      .eq('status', 'published')
      .maybeSingle();
    if (!data?.title) return fallback;

    const title = data.title as string;
    const description = metaDescription(
      data.synopsis as string | null,
      `Read ${title} in episodes, free on Intima.`
    );
    const images = data.cover_url ? [{ url: data.cover_url as string }] : undefined;
    return {
      // Plain title: the root template adds the " · Intima" suffix.
      title,
      description,
      alternates: { canonical: `/comics/series/${params.id}` },
      openGraph: { title: `${title} · Intima`, description, images, type: 'article' },
      twitter: {
        card: 'summary_large_image',
        title: `${title} · Intima`,
        description,
        images: images?.map((i) => i.url),
      },
    };
  } catch {
    return fallback;
  }
}

export default function ComicSeriesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
