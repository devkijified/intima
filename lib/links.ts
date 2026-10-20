/**
 * Dynamic links: every shareable surface gets one canonical link that
 * lands on the right page, renders a rich preview in WhatsApp and
 * social apps, and credits the companion who shared it (ref).
 *
 * Short form:  /c/{username}        -> 302 to /companion/{username}
 * Full form:   /companion/{username}?ref={username}
 */

export function siteOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://intima-snowy.vercel.app';
}

/** The link a companion shares for herself: short, credited to her. */
export function companionShareLink(username: string): string {
  return `${siteOrigin()}/c/${username}`;
}

/** Canonical profile URL (optionally with a referrer credit). */
export function companionLink(username: string, ref?: string): string {
  const base = `${siteOrigin()}/companion/${username}`;
  return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}

export function liveLink(sessionId: string, ref?: string): string {
  const base = `${siteOrigin()}/live/${sessionId}`;
  return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}

export function comicLink(episodeId: string): string {
  return `${siteOrigin()}/comics/${episodeId}`;
}

const REF_KEY = 'intima_ref';

/** Persist the referrer from a landed link, once, for signup credit. */
export function captureRefFromUrl(): void {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && !localStorage.getItem(REF_KEY)) {
      localStorage.setItem(REF_KEY, ref.slice(0, 80));
    }
  } catch {
    /* storage unavailable: attribution is best-effort */
  }
}

export function storedRef(): string | null {
  try {
    return localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

/** Native share sheet where available, clipboard everywhere else. */
export async function shareLink(opts: {
  url: string;
  title: string;
  text: string;
}): Promise<'shared' | 'copied'> {
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await navigator.share({ url: opts.url, title: opts.title, text: opts.text });
      return 'shared';
    } catch {
      /* user closed the sheet or it failed: fall through to copy */
    }
  }
  await navigator.clipboard.writeText(opts.url);
  return 'copied';
}
