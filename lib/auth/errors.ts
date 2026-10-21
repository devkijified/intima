/**
 * Turns raw auth/system errors into sentences a user can act on.
 * The raw message is still reported to /api/logs (error_logs table)
 * so debugging keeps the real detail; the screen never shows it.
 */
export function friendlyAuthError(err: unknown, fallback: string): string {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : ''

  if (raw && typeof window !== 'undefined') {
    void fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: raw.slice(0, 500),
        route: window.location.pathname,
        stack: err instanceof Error ? (err.stack ?? '').slice(0, 2000) : '',
      }),
    }).catch(() => {})
  }

  const m = raw.toLowerCase()
  if (m.includes('invalid login credentials')) {
    return 'That email and password do not match. Check them and try again.'
  }
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email first. Open the confirmation link we sent to your inbox.'
  }
  if (m.includes('already registered') || m.includes('already exists')) {
    return 'An account with this email already exists. Try signing in instead.'
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Please wait a moment, then try again.'
  }
  if (
    m.includes('failed to fetch') ||
    m.includes('network') ||
    m.includes('load failed')
  ) {
    return 'Connection problem. Check your internet and try again.'
  }
  if (m.includes('password should be')) {
    // Supabase password-policy messages are already written for humans.
    return raw
  }
  return fallback
}
