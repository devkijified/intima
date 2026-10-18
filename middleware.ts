import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Simple in-memory token bucket rate limiter.
 *
 * Protects /api/*, /login and /signup from brute force and scraping.
 * 30 requests per rolling 60 second window per IP. Exceeding it returns
 * 429 with a Retry-After header.
 *
 * Note: the bucket lives in the server instance memory, so on multi
 * instance deploys each instance enforces its own budget. Good enough
 * as a first line of defense; a shared store (Redis/Upstash) replaces
 * this when abuse becomes real.
 */

const WINDOW_MS = 60_000
const MAX_REQUESTS = 30

const buckets = new Map<string, { count: number; resetAt: number }>()

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

export function middleware(request: NextRequest) {
  const ip = clientIp(request)
  const now = Date.now()

  let bucket = buckets.get(ip)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS }
    buckets.set(ip, bucket)
  }

  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > 10_000) {
    for (const [key, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(key)
    }
  }

  bucket.count += 1

  if (bucket.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
    return new NextResponse('Too many requests. Please slow down.', {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/login', '/signup'],
}
