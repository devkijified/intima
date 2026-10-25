'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const KEY = 'intima_last_seen_ping'

/**
 * Stamps profiles.last_seen_at for the signed-in user while
 * they use the app, so chat partners can see when they were
 * last active. Throttled to about one write a minute (shared
 * across tabs through localStorage), re-pings when the tab
 * becomes visible again, stamps immediately on sign-in (the
 * root layout mounts once, possibly on the login page while
 * signed out), and swallows every error: presence is best
 * effort and must never disturb the page.
 */
export function LastSeenHeartbeat() {
  useEffect(() => {
    const supabase = createClient()
    let stopped = false

    async function ping(force = false) {
      try {
        const last = Number(localStorage.getItem(KEY) ?? 0)
        if (!force && Date.now() - last < 50_000) return
        localStorage.setItem(KEY, String(Date.now()))
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || stopped) return
        await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', user.id)
      } catch {
        /* presence is best effort */
      }
    }

    ping()
    // The root layout never remounts across in-app navigation, so
    // the mount ping can fire on the login page while signed out
    // and the next throttled chance is a minute away. Signing in
    // is exactly when presence matters: stamp on the auth event.
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') void ping(true)
    })
    const t = setInterval(() => ping(), 60_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') ping()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stopped = true
      authSub?.subscription.unsubscribe()
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return null
}
