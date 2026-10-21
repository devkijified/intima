import { createBrowserClient } from '@supabase/ssr'
import { beginQuery, endQuery } from '@/lib/queryLoading'

// Every Supabase browser request (REST, auth, storage) passes
// through this fetch, which makes it the one choke point for the
// global background-loading widget: begin/end around each request
// feeds the in-flight counter in lib/queryLoading.ts.
async function trackedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  beginQuery()
  try {
    return await fetch(input, init)
  } finally {
    endQuery()
  }
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: trackedFetch } }
  )
}
