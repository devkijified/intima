import { NextRequest, NextResponse } from 'next/server';
import { verifyImageRequest, isPublicHttpUrl } from '@/lib/comics/cdn';
import { PAGE_IMPORT_UA } from '@/lib/comics/pageImport';

export const maxDuration = 30;

/** A full desktop browser identity for the retry: some image hosts
 *  serve the importer UA on the page fetch but refuse it (or a bare
 *  origin referer) on the image itself. */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchUpstream(source: string, ua: string, browserStyle: boolean): Promise<Response | null> {
  try {
    return await fetch(source, {
      headers: {
        'User-Agent': ua,
        // The source site's own root page as referer: hotlink guards
        // accept a same-site page, and the root is the one page we
        // always know exists.
        Referer: new URL(source).origin + '/',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*',
        ...(browserStyle
          ? {
              'Accept-Language': 'en-US,en;q=0.9',
              'Sec-Fetch-Dest': 'image',
              'Sec-Fetch-Mode': 'no-cors',
              'Sec-Fetch-Site': 'cross-site',
            }
          : {}),
      },
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    });
  } catch {
    return null;
  }
}

function contentTypeOf(res: Response): string {
  return (res.headers.get('content-type') ?? '').split(';')[0].trim();
}

function isUsableImage(res: Response | null): boolean {
  return !!res && res.ok && !!res.body && contentTypeOf(res).startsWith('image/');
}

/**
 * GET /api/img?u=<base64url source>&s=<signature>
 * Serves an imported panel through our own domain. The first read
 * fetches from the source; the edge cache serves everyone after.
 * A failed or refused first fetch is retried once with a full
 * browser identity before giving up, because a good share of comic
 * hosts only refuse the first, lighter request shape.
 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') ?? '';
  const s = req.nextUrl.searchParams.get('s') ?? '';
  const source = verifyImageRequest(u, s);
  if (!source || !isPublicHttpUrl(source)) {
    return NextResponse.json({ error: 'Image not available' }, { status: 403 });
  }

  let upstream = await fetchUpstream(source, PAGE_IMPORT_UA, false);
  if (!isUsableImage(upstream)) {
    // Drain the refused response so the connection can be reused,
    // then retry once looking like a plain browser page load.
    // (The cast breaks the guard's narrowing of the let variable,
    // which otherwise resolves .body on type never.)
    const refused = upstream as Response | null;
    try { await refused?.body?.cancel(); } catch { /* already closed */ }
    upstream = await fetchUpstream(source, BROWSER_UA, true);
  }

  if (!upstream) {
    return NextResponse.json({ error: 'Image source unreachable' }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Image source failed' }, { status: 502 });
  }
  const ct = contentTypeOf(upstream);
  if (!ct.startsWith('image/')) {
    return NextResponse.json({ error: 'Not an image' }, { status: 415 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': ct,
      'Cache-Control': 'public, max-age=31536000, s-maxage=2592000, stale-while-revalidate=604800, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
