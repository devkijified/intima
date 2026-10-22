/**
 * Page-link comic import: fetch a chapter or series page the admin
 * pastes, pull the panel pictures out in reading order, and filter the
 * site's own decoration (logos, avatars, banners, trackers) out of the
 * result. Also discovers a series' chapter list from its numbered
 * links so a whole run can be imported in one click.
 * NOTE: only import comics you own or are licensed to republish.
 */

export const PAGE_IMPORT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export interface PanelCandidate {
  url: string;
  keep: boolean;
  reason: string | null;
}

export interface ChapterLink {
  no: number;
  url: string;
  label: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

export async function fetchPageHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': PAGE_IMPORT_UA, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(25000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Page fetch failed with HTTP ${res.status}`);
  const text = await res.text();
  return text.slice(0, 6_000_000);
}

const STRAY_PATH =
  /(logo|favicon|icon|avatar|banner|advert|\/ads?[-_\/]|ad[-_]|pixel|spacer|blank|loading|placeholder|sprite|emoji|gravatar|badge|button|arrow|bg[-_]|background|wp-content\/themes|wp-content\/plugins|1x1|tracking|analytics)/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i;

function dirOf(u: string): string {
  try {
    const url = new URL(u);
    return url.origin + url.pathname.replace(/\/[^/]*$/, '/');
  } catch {
    return u;
  }
}

function bestFromSrcset(srcset: string): string | null {
  const parts = srcset.split(',').map((p) => p.trim()).filter(Boolean);
  let best: string | null = null;
  let bestW = -1;
  for (const p of parts) {
    const [u, w] = p.split(/\s+/);
    const width = w && w.endsWith('w') ? parseInt(w, 10) : 0;
    if (u && width >= bestW) { bestW = width; best = u; }
  }
  return best;
}

/**
 * Extract panel candidates in document order and judge each one.
 * Panels on comic pages are the big images that share one folder;
 * everything else is site decoration until proven otherwise.
 */
export function extractPanels(html: string, pageUrl: string): PanelCandidate[] {
  const found: Array<{ url: string; w: number | null; h: number | null }> = [];
  const seen = new Set<string>();
  const imgRe = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const tag = m[0];
    const attr = (name: string) => {
      const mm = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`, 'i'))
        ?? tag.match(new RegExp(`${name}\\s*=\\s*'([^']+)'`, 'i'));
      return mm ? decodeEntities(mm[1]).trim() : null;
    };
    let raw = attr('src');
    const lazy = attr('data-src') ?? attr('data-lazy-src') ?? attr('data-original');
    if (lazy && (!raw || /blank|loading|placeholder|spacer|1x1/i.test(raw))) raw = lazy;
    const srcset = attr('srcset') ?? attr('data-srcset');
    if (srcset) raw = bestFromSrcset(srcset) ?? raw;
    if (!raw || raw.startsWith('data:')) continue;
    let abs: string;
    try { abs = new URL(raw, pageUrl).toString(); } catch { continue; }
    if (seen.has(abs)) continue;
    seen.add(abs);
    const w = parseInt(attr('width') ?? '', 10);
    const h = parseInt(attr('height') ?? '', 10);
    found.push({ url: abs, w: Number.isFinite(w) ? w : null, h: Number.isFinite(h) ? h : null });
  }

  // The panels are the largest folder cluster on the page.
  const byDir = new Map<string, number>();
  for (const f of found) {
    if (!IMAGE_EXT.test(f.url)) continue;
    const d = dirOf(f.url);
    byDir.set(d, (byDir.get(d) ?? 0) + 1);
  }
  let mainDir: string | null = null;
  let mainCount = 0;
  for (const [d, c] of byDir) if (c > mainCount) { mainCount = c; mainDir = d; }

  return found.map((f) => {
    if (!IMAGE_EXT.test(f.url)) return { url: f.url, keep: false, reason: 'Not a picture file' };
    if (STRAY_PATH.test(f.url)) return { url: f.url, keep: false, reason: 'Looks like site decoration' };
    if (f.w !== null && f.h !== null && (f.w < 300 || f.h < 300)) {
      return { url: f.url, keep: false, reason: 'Too small to be a panel' };
    }
    if (mainDir && mainCount >= 2 && dirOf(f.url) !== mainDir) {
      return { url: f.url, keep: false, reason: 'Different folder than the main panels' };
    }
    return { url: f.url, keep: true, reason: null };
  });
}

export function prettifySlug(segment: string): string {
  return segment
    .replace(/^\d{1,4}[-_]/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Find a series' chapters: links under the series path whose final
 * segment starts with the chapter number (the pattern lazy sites use:
 * /series/1-name/, /series/2-name/, ...). Read First and Read Last
 * links confirm the two ends of the run.
 */
export function discoverChapters(html: string, seriesUrl: string): ChapterLink[] {
  const base = new URL(seriesUrl);
  const seriesPath = base.pathname.replace(/\/$/, '');
  const byNo = new Map<number, ChapterLink>();
  const anchorRe = /<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  const consider = (href: string, text: string) => {
    let u: URL;
    try { u = new URL(decodeEntities(href), seriesUrl); } catch { return; }
    if (u.origin !== base.origin) return;
    const path = u.pathname.replace(/\/$/, '');
    if (!path.startsWith(seriesPath + '/')) return;
    const segment = path.slice(seriesPath.length + 1);
    if (!segment || segment.includes('/')) return;
    const num = segment.match(/^(\d{1,4})(?:[-_]|$)/);
    if (!num) return;
    const no = parseInt(num[1], 10);
    if (byNo.has(no)) return;
    const cleanText = decodeEntities(text.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    const label = cleanText && !/^read (first|last)$/i.test(cleanText) && cleanText.length <= 90
      ? cleanText
          .replace(/\s*\d+\s*[.]\s*/, ' ')
          .replace(/\[[^\]]*\]/g, '')
          .replace(/\s+-\s+chapter\s+\d+.*$/i, '')
          .replace(/\s+/g, ' ')
          .trim()
      : prettifySlug(segment);
    byNo.set(no, { no, url: u.toString(), label: label || `Episode ${no}` });
  };
  while ((m = anchorRe.exec(html)) !== null) consider(m[1], m[2]);
  return [...byNo.values()].sort((a, b) => a.no - b.no);
}

export function detectStoryStatus(html: string): 'ongoing' | 'completed' | null {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const m = text.match(/status[^a-z]{0,16}(on\s?going|completed|complete|hiatus)/i);
  if (!m) return null;
  return /complet/i.test(m[1]) ? 'completed' : 'ongoing';
}

export function pageTitle(html: string, fallbackUrl: string): string {
  const og = html.match(/<meta[^>]+property\s*=\s*"og:title"[^>]+content\s*=\s*"([^"]+)"/i)?.[1]
    ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?? html.match(/^Title:\s*(.+)$/m)?.[1]
    ?? '';
  const cleaned = decodeEntities(og)
    .replace(/\[[^\]]*\]/g, '')
    .split(/\s+[|]\s+/)[0]
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  if (cleaned) return cleaned;
  try {
    const seg = new URL(fallbackUrl).pathname.replace(/\/$/, '').split('/').pop() ?? '';
    return prettifySlug(seg) || 'Untitled episode';
  } catch {
    return 'Untitled episode';
  }
}

/**
 * Reading relays (used when a site refuses our server's direct fetch)
 * return markdown: images as ![alt](url), links as [text](url), and
 * linked images as [![alt](img)](href). Rewrite those into the plain
 * tags the extractors already understand.
 */
export function markdownToPseudoHtml(md: string): string {
  return md
    .replace(/\[!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\]\(([^)\s]+)\)/g,
      '<a href="$3"><img src="$2" alt="$1"></a>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      '<img src="$2" alt="$1">')
    .replace(/\[(.+?)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
      '<a href="$2">$1</a>');
}

/**
 * Fetch a page for import. Direct first; when the host refuses our
 * server (a fast 403 from a bot wall is the usual shape), fall back
 * to a public reading relay and normalize its markdown so the same
 * extractors run. The relay only ever supplies page structure for
 * discovery and extraction; panel images themselves always come
 * from the source through our own CDN endpoint.
 */
export async function fetchPageHtmlWithFallback(
  url: string
): Promise<{ html: string; relay: boolean }> {
  try {
    return { html: await fetchPageHtml(url), relay: false };
  } catch (directError) {
    try {
      const res = await fetch('https://r.jina.ai/' + url, {
        headers: { 'User-Agent': PAGE_IMPORT_UA, Accept: 'text/plain' },
        signal: AbortSignal.timeout(40000),
      });
      if (!res.ok) throw new Error(`Relay fetch failed with HTTP ${res.status}`);
      const md = await res.text();
      if (!md || md.length < 200) throw new Error('Relay returned an empty page');
      return { html: markdownToPseudoHtml(md.slice(0, 6_000_000)), relay: true };
    } catch {
      throw directError;
    }
  }
}
