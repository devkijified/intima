'use client'

import { useEffect } from 'react'
import { pushState, subscribePush, iosNeedsInstall } from '@/lib/push-client'

// Push is on by default: after login, the first tap or keypress anywhere
// triggers the permission prompt and subscribes this device, so event
// alerts work without a trip to Settings. Runs once per device; a denied
// permission is respected and never re-prompted.
export default function PushAutoSubscribe() {
  useEffect(() => {
    try {
      if (localStorage.getItem('intima_push_auto') === 'done') return
    } catch {
      return
    }
    // iOS Safari can't do push until the app is on the Home Screen; the
    // notifications page explains that. Don't burn the one attempt here.
    // (Left unmarked, so the installed app retries on its first run.)
    if (iosNeedsInstall()) return

    let fired = false
    const attempt = async () => {
      if (fired) return
      fired = true
      window.removeEventListener('pointerdown', attempt)
      window.removeEventListener('keydown', attempt)
      const markDone = () => {
        try {
          localStorage.setItem('intima_push_auto', 'done')
        } catch { /* silent */ }
      }
      try {
        const state = await pushState()
        if (state === 'available') {
          const res = await subscribePush()
          const after = await pushState()
          // Only stop retrying once we actually subscribed or the user said
          // no. A technical failure (no VAPID key yet, network hiccup)
          // leaves the flag unset so the next session tries again.
          if (after === 'subscribed' || after === 'denied' || res.reason === 'denied') markDone()
        } else {
          markDone()
        }
      } catch { /* silent */ }
    }
    window.addEventListener('pointerdown', attempt)
    window.addEventListener('keydown', attempt)
    return () => {
      window.removeEventListener('pointerdown', attempt)
      window.removeEventListener('keydown', attempt)
    }
  }, [])

  return null
}
