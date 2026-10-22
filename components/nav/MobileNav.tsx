'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Banknote, Bell, BookOpen, CalendarCheck, ClipboardList, Coins, Heart,
  LayoutDashboard, LayoutGrid, LogOut, Map as MapIcon, Radio, ShieldAlert,
  Ticket, Trophy, User,
} from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { getSetting } from '@/lib/settings/platformSettings'
import { formatCompactCount } from '@/lib/utils/helpers'

/**
 * The mobile bottom bar plus its More sheet, shared by the
 * dashboard shell (in-flow variant) and the comics pages (fixed
 * variant) so both wear the exact same bar. Tabs: Home, Live, the
 * popped-out Map button, Comics (with the unseen-episodes badge),
 * and More. Everything else lives in the More sheet.
 */
export function MobileNav({ variant = 'flow' }: { variant?: 'flow' | 'fixed' }) {
  const pathname = usePathname()
  const supabase = createClient()
  const [userRole, setUserRole] = useState<string>('client')
  const [channelEnabled, setChannelEnabled] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [unseen, setUnseen] = useState(0)

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !live) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (live) setUserRole(profile?.role || user.user_metadata?.role || 'client')
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Channel is parked in draft behind the channel_enabled platform
  // setting; its sheet entry renders only when the flag is on.
  useEffect(() => {
    let cancelled = false
    getSetting<boolean | string>('channel_enabled', false).then((v) => {
      if (!cancelled) setChannelEnabled(v === true || v === 'true')
    })
    return () => { cancelled = true }
  }, [])

  // Unseen episode count for the Comics badge: refresh on mount and
  // whenever the route changes (opening a series marks it seen).
  useEffect(() => {
    let live = true
    fetch('/api/comics/follow')
      .then((r) => r.json())
      .then((j) => { if (live && typeof j?.unseenTotal === 'number') setUnseen(j.unseenTotal) })
      .catch(() => {})
    return () => { live = false }
  }, [pathname])

  // The More sheet closes whenever the route changes.
  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const isModel = userRole === 'model'
  const isAdmin = userRole === 'admin' || userRole === 'super_admin'

  // Sheet icons: Bookings gets the ticked calendar and Board the
  // task board, so the two never read as the same glyph at a glance.
  const sheetItems = [
    { href: '/bookings', icon: CalendarCheck, label: 'Bookings', active: pathname.startsWith('/bookings') },
    { href: '/board', icon: ClipboardList, label: 'Board', active: pathname.startsWith('/board') },
    { href: '/coins', icon: Coins, label: 'Coins', active: pathname.startsWith('/coins') },
    { href: '/perks', icon: Trophy, label: 'Perks', active: pathname.startsWith('/perks') },
    { href: '/tickets', icon: Ticket, label: 'Support tickets', active: pathname.startsWith('/tickets') },
    { href: '/saved', icon: Heart, label: 'Saved', active: pathname.startsWith('/saved') },
    { href: '/profile', icon: User, label: 'Profile', active: pathname.startsWith('/profile') },
    ...(isModel
      ? [{ href: '/earnings', icon: Banknote, label: 'Earnings', active: pathname.startsWith('/earnings') }]
      : []),
    ...(channelEnabled
      ? [{ href: '/channel', icon: Bell, label: 'Channel', active: pathname.startsWith('/channel') }]
      : []),
    ...(isAdmin
      ? [{ href: '/admin', icon: ShieldAlert, label: 'Admin', active: pathname.startsWith('/admin') }]
      : []),
  ]
  const moreActive = moreOpen || sheetItems.some((i) => i.active)

  const tabs = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Home', active: pathname === '/dashboard' },
    { href: '/live', icon: Radio, label: 'Live', active: pathname.startsWith('/live') },
    { href: '/', icon: MapIcon, label: 'Map', active: pathname === '/', pop: true },
    { href: '/comics', icon: BookOpen, label: 'Comics', active: pathname.startsWith('/comics') },
  ]

  return (
    <>
      <nav
        className={
          (variant === 'fixed'
            ? 'fixed inset-x-0 bottom-0 z-40 '
            : 'relative z-40 shrink-0 ') +
          'border-t border-neutral-200/80 bg-[#FDF9F6]/95 backdrop-blur-md md:hidden'
        }
      >
        <div className="grid grid-cols-5 px-1 py-1.5">
          {tabs.map(({ href, icon: Icon, label, active, pop }) => (
            <Link
              key={href}
              href={href}
              className={'flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors ' + (active ? 'text-primary' : 'text-neutral-400')}
            >
              {pop ? (
                <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-[#AC244D] text-white shadow-[0_8px_20px_rgba(172,36,77,0.45)] ring-4 ring-[#FDF9F6]">
                  <Icon className="h-6 w-6" />
                </span>
              ) : (
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {label === 'Comics' && unseen > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#AC244D] px-1 text-[9px] font-bold text-white ring-2 ring-[#FDF9F6]">
                      {formatCompactCount(unseen)}
                    </span>
                  )}
                </span>
              )}
              {label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={'flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors ' + (moreActive ? 'text-primary' : 'text-neutral-400')}
          >
            <LayoutGrid className="h-5 w-5" />
            More
          </button>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      {/* More sheet: every other destination, one tap from the bar. */}
      {moreOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 h-full w-full bg-black/45"
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-[#FDF9F6] px-5 pt-3 shadow-2xl"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300" />
            <div className="grid grid-cols-4 gap-2">
              {sheetItems.map(({ href, icon: Icon, label, active }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center gap-1.5 py-2 text-center"
                >
                  <span
                    className={
                      'flex h-12 w-12 items-center justify-center rounded-full ' +
                      (active ? 'bg-primary text-white' : 'bg-white text-neutral-600 shadow-xs ring-1 ring-black/[0.06]')
                    }
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className={'text-[11px] font-medium ' + (active ? 'text-primary' : 'text-neutral-600')}>
                    {label}
                  </span>
                </Link>
              ))}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-neutral-600 shadow-xs ring-1 ring-black/[0.06] transition-colors active:scale-[0.99]"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </div>
      )}
    </>
  )
}
