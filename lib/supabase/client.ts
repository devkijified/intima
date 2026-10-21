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

// IMPORTANT: the installed @supabase/ssr is 0.1.0. Its createBrowserClient
// destructures `cookies` out of whatever options object it receives;
// pass options WITHOUT a cookies key and `cookies` becomes undefined,
// after which every storage getItem/setItem throws "Cannot read
// properties of undefined (reading 'get' / 'set')" and sign-in dies.
// Always pass an explicit get/set/remove adapter over document.cookie
// (same lesson as the server client in lib/supabase/server.ts).
type CookieSetOptions = {
  maxAge?: number
  path?: string
  domain?: string
  sameSite?: string | boolean
  secure?: boolean
}

const browserCookies = {
  get(name: string): string | undefined {
    if (typeof document === 'undefined') return undefined
    const prefix = `${name}=`
    const part = document.cookie.split('; ').find((c) => c.startsWith(prefix))
    if (!part) return undefined
    const raw = part.slice(prefix.length)
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  },
  set(name: string, value: string, options: CookieSetOptions = {}) {
    if (typeof document === 'undefined') return
    let str = `${name}=${encodeURIComponent(value)}`
    str += `; Path=${options.path ?? '/'}`
    if (typeof options.maxAge === 'number') str += `; Max-Age=${Math.floor(options.maxAge)}`
    if (options.domain) str += `; Domain=${options.domain}`
    if (options.sameSite) {
      str += `; SameSite=${options.sameSite === true ? 'Strict' : options.sameSite}`
    }
    if (options.secure) str += '; Secure'
    document.cookie = str
  },
  remove(name: string, options: CookieSetOptions = {}) {
    browserCookies.set(name, '', { ...options, maxAge: 0 })
  },
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: browserCookies, global: { fetch: trackedFetch } }
  )
}
