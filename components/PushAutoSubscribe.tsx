'use client'

import { useEffect } from 'react'
import { pushState, subscribePush, iosNeedsInstall } from '@/lib/push-client'

// Push permission prompt fires shortly after load, like a native app.
// Runs once per device; a denied permission is respected and never re-prompted.
export default function PushAutoSubscribe() {
  useEffect(() => {
    try {
      if (localStorage.getItem('intima_push_auto') === 'done') return
    } catch {
      return
    }
    // iOS Safari can't do push until the app is on the Home Screen; the
    // notifications page explains that. Don't burn the one attempt here.
    if (iosNeedsInstall()) return

    const markDone = () => {
      try {
        localStorage.setItem('intima_push_auto', 'done')
      } catch { /* silent */ }
    }
    // Small delay so the splash/page paints first.
    const t = setTimeout(async () => {
      try {
        const state = await pushState()
        if (state === 'available') {
          const res = await subscribePush()
          const after = await pushState()
          if (after === 'subscribed' || after === 'denied' || res.reason === 'denied') markDone()
        } else {
          markDone()
        }
      } catch { /* silent */ }
    }, 2500)
    return () => clearTimeout(t)
  }, [])

  return null
}
