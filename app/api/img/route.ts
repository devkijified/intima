import { NextRequest, NextResponse } from 'next/server';
import { verifyImageRequest, isPublicHttpUrl } from '@/lib/comics/cdn';
import { PAGE_IMPORT_UA } from '@/lib/comics/pageImport';

export const maxDuration = 30;

/**
 * GET /api/img?u=<base64url source>&s=<signature>
 * Serves an imported panel through our own domain. The first read
 * fetches from the source; the edge cache serves everyone after.
 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') ?? '';
  const s = req.nextUrl.searchParams.get('s') ?? '';
  const source = verifyImageRequest(u, s);
  if (!source || !isPublicHttpUrl(source)) {
    return NextResponse.json({ error: 'Image not available' }, { status: 403 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(source, {
      headers: {
        'User-Agent': PAGE_IMPORT_UA,
        Referer: new URL(source).origin + '/',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*',
      },
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    });
  } catch {
    return NextResponse.json({ error: 'Image source unreachable' }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Image source failed' }, { status: 502 });
  }
  const ct = (upstream.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!ct.startsWith('image/')) {
    return NextResponse.json({ error: 'Not an image' }, { status: 415 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': ct,
      'Cache-Control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
