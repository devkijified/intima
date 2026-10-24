'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const KEY = 'intima_last_seen_ping'

/**
 * Stamps profiles.last_seen_at for the signed-in user while
 * they use the app, so chat partners can see when they were
 * last active. Throttled to about one write a minute (shared
 * across tabs through localStorage), re-pings when the tab
 * becomes visible again, and swallows every error: presence
 * is best effort and must never disturb the page.
 */
export function LastSeenHeartbeat() {
  useEffect(() => {
    const supabase = createClient()
    let stopped = false

    async function ping() {
      try {
        const last = Number(localStorage.getItem(KEY) ?? 0)
        if (Date.now() - last < 50_000) return
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
    const t = setInterval(ping, 60_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') ping()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stopped = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return null
}
