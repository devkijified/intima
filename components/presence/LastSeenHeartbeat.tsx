'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { setOnlineUserIds, clearOnlineUserIds } from '@/lib/presence/online'

const KEY = 'intima_last_seen_ping'

/**
 * Presence, WhatsApp shape, in one root-mounted component:
 *
 * ONLINE is live: every visitor, signed in or not, joins a
 * Supabase Realtime Presence channel (a websocket) and
 * receives the online set, which feeds useIsOnline for the
 * chat header, the map pins and the recency lines. The
 * channel key is a throwaway per-tab id; identity rides in
 * the tracked payload (user_id), so signing in or out never
 * rebuilds the channel, it just tracks or untracks. Only
 * signed-in users are ever tracked, so the set only ever
 * names signed-in people.
 *
 * LAST SEEN is the stamp: profiles.last_seen_at is written
 * on sign-in, about once a minute while the app is in use,
 * and once more at the moment of leaving (tab hidden or
 * page closing), that last write going through a keepalive
 * fetch so it still lands while the page is going away.
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
    let tracked = false
    let subscribed = false
    let trackedUserId: string | null = null
    let sessionRef: { userId: string; accessToken: string } | null = null

    const channel = supabase.channel('online-presence', {
      config: { presence: { key: `tab-${Math.random().toString(36).slice(2, 10)}` } },
    })
    channel.on('presence', { event: 'sync' }, () => {
      if (stopped) return
      const ids = new Set<string>()
      for (const metas of Object.values(channel.presenceState())) {
        for (const meta of metas as Array<{ user_id?: string }>) {
          if (meta.user_id) ids.add(meta.user_id)
        }
      }
      setOnlineUserIds(ids)
    })
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' && !stopped) {
        subscribed = true
        if (trackedUserId && !tracked && subscribed) {
          tracked = true
          void channel.track({ user_id: trackedUserId, online_at: new Date().toISOString() })
        }
      }
    })

    function trackAs(userId: string) {
      trackedUserId = userId
      // Tracking before the channel finishes subscribing does
      // not take; the subscribe callback re-tracks from
      // trackedUserId when it lands.
      if (subscribed && !tracked) {
        tracked = true
        void channel.track({ user_id: userId, online_at: new Date().toISOString() })
      }
    }

    function untrack() {
      trackedUserId = null
      if (tracked) {
        tracked = false
        void channel.untrack()
      }
    }

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
        if (event === 'SIGNED_IN') {
          try {
            localStorage.setItem(KEY, String(Date.now()))
          } catch {
            /* storage unavailable */
          }
          void stamp(session.user.id)
        }
        trackAs(session.user.id)
      }
      if (event === 'SIGNED_OUT') {
        sessionRef = null
        untrack()
      }
    })
    // Already signed in at mount (a full page load): the auth
    // event for the restored session may have fired before
    // this listener attached, so track from the session too.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (stopped || !session?.user) return
      sessionRef = { userId: session.user.id, accessToken: session.access_token }
      trackAs(session.user.id)
    })

    const t = setInterval(() => ping(), 60_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        ping()
        if (trackedUserId && !tracked && subscribed) {
          tracked = true
          void channel.track({ user_id: trackedUserId, online_at: new Date().toISOString() })
        }
      } else {
        // Backgrounded: no longer "online", and this moment
        // is exactly their last seen.
        if (tracked) {
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
      void supabase.removeChannel(channel)
      clearOnlineUserIds()
    }
  }, [])

  return null
}
