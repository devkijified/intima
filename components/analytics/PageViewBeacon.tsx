'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * First-party page view beacon: posts one row per route view to
 * /api/track (see supabase/migrations/056_page_views.sql). Renders
 * nothing. The device id in localStorage is what lets the admin
 * analytics approximate unique visitors for signed-out traffic.
 */

const ANON_KEY = 'intima_anon_id'

function getAnonId(): string {
  try {
    let id = window.localStorage.getItem(ANON_KEY)
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
              .toString(36)
              .slice(2)}`
      window.localStorage.setItem(ANON_KEY, id)
    }
    return id
  } catch {
    return 'unknown'
  }
}

export function PageViewBeacon() {
  const pathname = usePathname()
  const last = useRef<{ path: string; at: number } | null>(null)

  useEffect(() => {
    if (!pathname) return
    const now = Date.now()
    // Guard against React strict-mode double effects and rapid
    // re-renders: one send per pathname, at least 1s apart.
    if (last.current && last.current.path === pathname && now - last.current.at < 1000) {
      return
    }
    // The external referrer only exists on the first view of the
    // session; later SPA navigations would just repeat it and
    // inflate that host, so it is sent on the first fire only.
    const firstView = last.current === null
    last.current = { path: pathname, at: now }

    const payload = JSON.stringify({
      path: pathname,
      referrer: firstView ? document.referrer || '' : '',
      anonId: getAnonId(),
    })
    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const sent = navigator.sendBeacon(
          '/api/track',
          new Blob([payload], { type: 'application/json' })
        )
        if (sent) return
      }
      void fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {})
    } catch {
      // Tracking is best effort only; it must never disturb the app.
    }
  }, [pathname])

  return null
}
