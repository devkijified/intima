'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { setOnlineUserIds, clearOnlineUserIds } from '@/lib/presence/online'

const KEY = 'intima_last_seen_ping'

/**
 * Presence, WhatsApp shape, in one root-mounted component:
 *
 * ONLINE is live: the signed-in user joins a Supabase
 * Realtime Presence channel (a websocket). Everyone in the
 * channel sees joins and leaves within a second or two, and
 * the online set feeds useIsOnline for surfaces like the
 * chat header, which can show "Active now" the moment it is
 * true instead of trusting a minutes-old stamp.
 *
 * LAST SEEN is the stamp: profiles.last_seen_at is written
 * on sign-in, about once a minute while the app is in use,
 * and once more at the moment of leaving (tab hidden or page
 * closing), that last write going through a keepalive fetch
 * so it still lands while the page is going away.
 *
 * Backgrounding the app untracks presence, like WhatsApp:
 * online means in the app, looking at it, now. Every error
 * is swallowed; presence is best effort and must never
 * disturb the page.
 */
export function LastSeenHeartbeat() {
  useEffect(() => {
    const supabase = createClient()
    let stopped = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    let tracked = false
    let sessionRef: { userId: string; accessToken: string } | null = null

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

    // The leaving stamp must survive the page going away, so
    // it rides a keepalive fetch straight to PostgREST
    // instead of the supabase client.
    function stampAndGo() {
      const s = sessionRef
      if (!s) return
      try {
        void fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${s.userId}`,
          {
            method: 'PATCH',
            keepalive: true,
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
              Authorization: `Bearer ${s.accessToken}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
          },
        ).catch(() => {})
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

    function joinPresence(userId: string) {
      if (channel || stopped) return
      channel = supabase.channel('online-presence', {
        config: { presence: { key: userId } },
      })
      channel.on('presence', { event: 'sync' }, () => {
        if (stopped || !channel) return
        setOnlineUserIds(Object.keys(channel.presenceState()))
      })
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !stopped) {
          tracked = true
          await channel?.track({ online_at: new Date().toISOString() })
        }
      })
    }

    function leavePresence() {
      if (channel) {
        void supabase.removeChannel(channel)
        channel = null
        tracked = false
      }
      clearOnlineUserIds()
    }

    ping()
    // The root layout mounts once, possibly on the login page
    // while signed out, and never remounts across in-app
    // navigation. Act on the auth event itself, using the
    // session the event carries: calling auth methods from
    // inside this callback can deadlock in supabase-js.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        sessionRef = { userId: session.user.id, accessToken: session.access_token }
      }
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        try {
          localStorage.setItem(KEY, String(Date.now()))
        } catch {
          /* storage unavailable */
        }
        void stamp(session.user.id)
        joinPresence(session.user.id)
      }
      if (event === 'SIGNED_OUT') {
        sessionRef = null
        leavePresence()
      }
    })
    // Already signed in at mount (a full page load): the auth
    // event for the restored session may have fired before
    // this listener attached, so join from the session too.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (stopped || !session?.user) return
      sessionRef = { userId: session.user.id, accessToken: session.access_token }
      joinPresence(session.user.id)
    })

    const t = setInterval(() => ping(), 60_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        ping()
        if (channel && !tracked) {
          tracked = true
          void channel.track({ online_at: new Date().toISOString() })
        }
      } else {
        // Backgrounded: no longer "online", and this moment
        // is exactly their last seen.
        if (channel && tracked) {
          tracked = false
          void channel.untrack()
        }
        stampAndGo()
      }
    }
    const onHide = () => stampAndGo()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)
    return () => {
      stopped = true
      authSub?.subscription.unsubscribe()
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
      leavePresence()
    }
  }, [])

  return null
}
