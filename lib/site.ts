/**
 * The app's public host, parsed from the runtime origin. On the
 * client it reads window.location, so it always matches the
 * domain the app is actually served from: move to a new domain
 * and every consumer (content watermarks first) picks the new
 * host up with no code change. The server fallback is the current
 * production host and is only ever seen before hydration.
 */
export function siteHost(): string {
  if (typeof window !== 'undefined' && window.location?.host) {
    return window.location.host
  }
  return 'intima-snowy.vercel.app'
}

/** "host/username": the content watermark line. */
export function watermarkText(username?: string | null): string {
  const host = siteHost()
  return username ? `${host}/${username}` : host
}
