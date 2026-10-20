import type { MetadataRoute } from 'next';

const BASE_URL = 'https://intima-snowy.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/city', '/companion', '/c', '/comics', '/live'],
      disallow: [
        '/api/',
        '/admin',
        '/dashboard',
        '/messages',
        '/profile',
        '/setup',
        '/wallet',
        '/coins',
        '/earnings',
        '/bookings',
        '/channel',
        '/saved',
        '/notifications',
        '/verification',
        '/models',
        '/payments',
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
