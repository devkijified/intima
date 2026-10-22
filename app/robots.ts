import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * Public content is crawlable; every signed-in, transactional or
 * admin surface stays out of the index. The sitemap carries the
 * canonical public list.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin',
        '/dashboard',
        '/auth',
        '/messages',
        '/profile',
        '/setup',
        '/wallet',
        '/coins',
        '/earnings',
        '/bookings',
        '/board',
        '/channel',
        '/saved',
        '/notifications',
        '/verification',
        '/models',
        '/payments',
        '/tickets',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
