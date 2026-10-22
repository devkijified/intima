/**
 * Minimal RSS/Atom parser for comic import feeds.
 * Extracts item title, date, guid, link, and every image (enclosures,
 * media:content, or <img> in the content). No XML dependency.
 */

export interface FeedItem {
  guid: string;
  title: string;
  pubDate: string | null;
  link: string | null;
  description: string | null;
  images: string[];
  /** Best cover candidate: the widest image the feed declares
   *  (media width attribute or a size baked into the filename),
   *  so the episode cover is not whichever small image came first. */
  cover: string | null;
}

/** Width estimate for a feed image: explicit width attribute on its
 *  tag, else a WordPress style size in the filename (-800x1200). */
function widthHintOf(url: string, tag: string | null): number {
  if (tag) {
    const w = tag.match(/\bwidth\s*=\s*"(\d{2,5})"/i);
    if (w) return parseInt(w[1], 10);
  }
  const sized = url.split('?')[0].match(/-(\d{2,5})x(\d{2,5})\.(?:jpe?g|png|webp|avif)$/i);
  return sized ? parseInt(sized[1], 10) : 0;
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function textOf(body: string, re: RegExp): string | null {
  const m = body.match(re);
  return m ? decodeEntities(stripCdata(m[1])) : null;
}

export function parseFeed(xml: string, feedUrl: string): { name: string; items: FeedItem[] } {
  const rawName =
    textOf(xml, /<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/) ??
    textOf(xml, /<feed[^>]*>[\s\S]*?<title>([\s\S]*?)<\/title>/) ??
    feedUrl;
  const name = rawName.slice(0, 80);

  const items: FeedItem[] = [];
  const itemRe = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const body = m[2];
    const title = textOf(body, /<title>([\s\S]*?)<\/title>/) ?? 'Untitled episode';
    const guid =
      textOf(body, /<guid[^>]*>([\s\S]*?)<\/guid>/) ??
      textOf(body, /<id>([\s\S]*?)<\/id>/) ??
      textOf(body, /<link>([\s\S]*?)<\/link>/);
    if (!guid) continue;
    const pubDate =
      textOf(body, /<pubDate>([\s\S]*?)<\/pubDate>/) ??
      textOf(body, /<published>([\s\S]*?)<\/published>/) ??
      textOf(body, /<updated>([\s\S]*?)<\/updated>/);
    const link =
      textOf(body, /<link>([\s\S]*?)<\/link>/) ??
      body.match(/<link[^>]*href="([^"]+)"/)?.[1] ??
      null;
    const html =
      textOf(body, /<content:encoded>([\s\S]*?)<\/content:encoded>/) ??
      textOf(body, /<description>([\s\S]*?)<\/description>/) ??
      textOf(body, /<summary>([\s\S]*?)<\/summary>/) ??
      '';

    const images: string[] = [];
    let cover: string | null = null;
    let coverW = -1;
    const add = (u: string | null | undefined, tag: string | null = null) => {
      const url = u ? decodeEntities(u).trim() : '';
      if (!url.startsWith('http')) return;
      if (!images.includes(url)) images.push(url);
      const w = widthHintOf(url, tag);
      if (w > coverW) { coverW = w; cover = url; }
    };
    for (const mm of body.matchAll(/<(?:enclosure|media:content|media:thumbnail)\b[^>]*>/g)) {
      add(mm[0].match(/(?:url|href)="([^"]+)"/)?.[1], mm[0]);
    }
    for (const mm of html.matchAll(/<img\b[^>]*>/g)) {
      add(mm[0].match(/src="([^"]+)"/)?.[1], mm[0]);
    }

    items.push({
      guid,
      title: title.slice(0, 200),
      pubDate,
      link,
      description: html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) : null,
      images,
      cover: cover ?? images[0] ?? null,
    });
  }
  return { name, items };
}

export async function fetchFeed(feedUrl: string): Promise<{ name: string; items: FeedItem[] }> {
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'IntimaComics/1.0 (+https://intima.ng)' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Feed fetch failed with HTTP ${res.status}`);
  const xml = await res.text();
  return parseFeed(xml, feedUrl);
}
