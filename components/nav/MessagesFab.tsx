'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageCircle } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { formatCompactCount } from '@/lib/utils/helpers'

/**
 * Messages as a floating button now that Comics holds the tab bar
 * slot. The badge counts unread messages across the member's active
 * connections (same counting the messages page uses per thread).
 * It shares the docked player's perch on mobile and hides while
 * the member is already in Messages, and on the full-screen live
 * surfaces (a stream room, the host studio) where it floated over
 * the stage and the sheets.
 */
export function MessagesFab() {
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUnread(0); return }
    const { data: conns } = await supabase
      .from('connections')
      .select('id')
      .or(`client_id.eq.${user.id},provider_id.eq.${user.id}`)
      .eq('status', 'active')
    const ids = ((conns ?? []) as { id: string }[]).map((c) => c.id)
    if (ids.length === 0) { setUnread(0); return }
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('connection_id', ids)
      .neq('sender_id', user.id)
      .is('read_at', null)
    setUnread(count ?? 0)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    // Reading a thread then coming back should clear this badge
    // immediately, not at the next minute tick.
    const onVis = () => { if (document.visibilityState === 'visible') void load() }
    window.addEventListener('focus', load)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', load)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load, pathname])

  if (pathname.startsWith('/messages')) return null
  if (pathname === '/models/live' || /^\/live\/[^/]+/.test(pathname)) return null

  return (
    <Link
      href="/messages"
      aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
      className="fixed right-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-[#AC244D] text-white shadow-[0_10px_24px_rgba(172,36,77,0.45)] transition-all active:scale-95 md:right-6 md:bottom-6"
    >
      <MessageCircle className="h-6 w-6" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C9A84C] px-1 text-[10px] font-bold text-[#1A1A1A] ring-2 ring-[#FDF9F6]">
          {formatCompactCount(unread)}
        </span>
      )}
    </Link>
  )
}
