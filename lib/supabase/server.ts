import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// IMPORTANT: the installed @supabase/ssr is 0.1.0. Its createServerClient
// speaks the get / set / remove cookie interface. The getAll / setAll
// interface only arrived in later versions. This file previously passed
// getAll / setAll, which 0.1.0 silently ignores, so the server client
// could never read the session cookie and every authenticated API route
// returned 401 "Sign in required" for genuinely signed-in users.
// Keep this adapter in the 0.1.0 shape until the package is upgraded
// deliberately (an upgrade also changes the browser cookie encoding,
// which signs everyone out once).
export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            cookieStore.set(name, value, options as never)
          } catch {
            // Server components cannot write cookies; the middleware
            // session refresh covers that path. Route handlers can set.
          }
        },
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set(name, '', { ...options, maxAge: 0 } as never)
          } catch {
            // Same read-only caveat as set().
          }
        },
      },
    }
  )
}
