'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const KEY = 'intima_last_seen_ping'

/**
 * Stamps profiles.last_seen_at for the signed-in user while
 * they use the app, so chat partners can see when they were
 * last active. Mounted once in the root layout, so every
 * surface counts, the map included. Throttled to about one
 * write a minute (shared across tabs through localStorage),
 * re-pings when the tab becomes visible again, and stamps
 * immediately on sign-in. Presence is best effort: every
 * error is swallowed and it must never disturb the page.
 */
export function LastSeenHeartbeat() {
  useEffect(() => {
    const supabase = createClient()
    let stopped = false

    async function stamp(uid: string) {
      try {
        await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', uid)
      } catch {
        /* presence is best effort */
      }
    }

    async function ping(force = false) {
      try {
        const last = Number(localStorage.getItem(KEY) ?? 0)
        if (!force && Date.now() - last < 50_000) return
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user || stopped) return
        localStorage.setItem(KEY, String(Date.now()))
        await stamp(user.id)
      } catch {
        /* presence is best effort */
      }
    }

    ping()
    // The root layout mounts once, possibly on the login page
    // while signed out, and never remounts across in-app
    // navigation. Stamp on the auth event itself, using the
    // user the event carries: calling auth methods from inside
    // this callback can deadlock in supabase-js, and sign-in is
    // exactly when presence matters.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        try {
          localStorage.setItem(KEY, String(Date.now()))
        } catch {
          /* storage unavailable */
        }
        void stamp(session.user.id)
      }
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
