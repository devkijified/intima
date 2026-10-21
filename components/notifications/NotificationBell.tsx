'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { Tooltip } from '@/components/ui/Tooltip'

export function NotificationBell() {
  const [unread, setUnread] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    async function fetchUnread() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count } = await supabase.from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('read', false)
      setUnread(count ?? 0)
    }
    fetchUnread()
    const ch = supabase.channel('notif-bell')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => fetchUnread())
      .subscribe()
    const timer = setInterval(fetchUnread, 60000)
    return () => { supabase.removeChannel(ch); clearInterval(timer) }
  }, [supabase])

  return (
    <Tooltip label="Notifications" side="bottom">
      <Link href="/notifications" aria-label="Notifications" className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-2 text-neutral-500 transition-all hover:bg-white hover:text-primary">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>
    </Tooltip>
  )
}
