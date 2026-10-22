/**
 * Our own image CDN for imported comic panels.
 *
 * Imported episodes store panel addresses wrapped in /api/img URLs
 * signed with an HMAC of the source address, so readers always load
 * panels from our domain and the edge cache serves them after the
 * first read. The source address stays recoverable from the token,
 * and the signature keeps the endpoint from being an open proxy.
 */
import { createHmac } from 'crypto';

function key(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'intima-cdn-fallback';
}

export function signImageUrl(sourceUrl: string): string {
  return createHmac('sha256', key()).update(sourceUrl).digest('hex').slice(0, 24);
}

export function cdnImagePath(sourceUrl: string): string {
  const u = Buffer.from(sourceUrl, 'utf8').toString('base64url');
  return `/api/img?u=${u}&s=${signImageUrl(sourceUrl)}`;
}

/** Wrap an absolute panel address in our CDN path (idempotent). */
export function toCdnUrl(sourceUrl: string): string {
  if (!sourceUrl.startsWith('http')) return sourceUrl;
  if (sourceUrl.includes('/api/img?u=')) return sourceUrl;
  return cdnImagePath(sourceUrl);
}

export function verifyImageRequest(u: string, s: string): string | null {
  let source: string;
  try {
    source = Buffer.from(u, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!source.startsWith('http')) return null;
  if (signImageUrl(source) !== s) return null;
  return source;
}

/** Refuse to fetch private or local addresses through the CDN. */
export function isPublicHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local')) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (host === '::1') return false;
    return true;
  } catch {
    return false;
  }
}
