'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { LogOut, User, Calendar, LayoutDashboard, Compass, Wallet, Video, ShieldAlert, Map as MapIcon, Radio, Heart,
  MessageCircle,
  Coins,
  Trophy,
  LayoutGrid,
  ListChecks,
  Banknote, Bell } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { getSetting } from '@/lib/settings/platformSettings'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [userRole, setUserRole] = useState<string>('client')
  const [channelEnabled, setChannelEnabled] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      // profiles.role is the source of truth (metadata goes stale
      // after role changes like admin promotion).
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      const role = profile?.role || user.user_metadata?.role || user.app_metadata?.role
      setUserRole(role || 'client')
      setLoading(false)
    }

    checkUser()
  }, [supabase])

  // Channel is parked in draft behind the channel_enabled platform
  // setting. Its More-sheet entry renders only when the flag is
  // explicitly on. One settings flip restores the whole surface
  // (sheet entry plus the page itself gates on the same flag).
  useEffect(() => {
    let cancelled = false
    getSetting<boolean | string>('channel_enabled', false).then((v) => {
      if (!cancelled) setChannelEnabled(v === true || v === 'true')
    })
    return () => { cancelled = true }
  }, [])

  // The More sheet closes whenever the route changes.
  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#FDF9F6] flex items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#AC244D] border-t-transparent"></div>
      </div>
    )
  }

  const isModel = userRole === 'model'
  const isAdmin = userRole === 'admin' || userRole === 'super_admin'

  // Mobile bar, Facebook pattern: only the everyday tabs live in
  // the bar; everything else sits in the More bottom sheet so the
  // bar never chokes as features grow.
  const sheetItems = [
    { href: '/bookings', icon: Calendar, label: 'Bookings', active: pathname.startsWith('/bookings') },
    { href: '/board', icon: ListChecks, label: 'Board', active: pathname.startsWith('/board') },
    { href: '/coins', icon: Coins, label: 'Coins', active: pathname.startsWith('/coins') },
    { href: '/perks', icon: Trophy, label: 'Perks', active: pathname.startsWith('/perks') },
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

  return (
    <div className="min-h-dvh bg-[#FDF9F6] text-[#1A1A1A] font-sans selection:bg-[#AC244D]/20 selection:text-[#AC244D]">
      <header
        className="border-b border-neutral-200/85 bg-[#FDF9F6]/90 backdrop-blur-md sticky top-0 z-50"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3.5">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="text-2xl font-serif tracking-tight text-[#AC244D]">
              Intima
            </Link>

            <nav className="hidden md:flex items-center space-x-1 lg:space-x-2 bg-white/60 border border-neutral-200/80 px-3 py-1.5 rounded-full shadow-xs">
              <Link 
                href="/dashboard" 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  pathname === '/dashboard' ? 'bg-[#AC244D] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60'
                }`}
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Dashboard</span>
              </Link>

              <Link 
                href="/live" 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  pathname.startsWith('/live') ? 'bg-[#AC244D] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60'
                }`}
              >
                <Radio className="h-4 w-4" />
                <span>Live</span>
              </Link>
              {isModel && (
                <Link 
                  href="/earnings" 
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    pathname.startsWith('/earnings') ? 'bg-[#AC244D] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60'
                  }`}
                >
                  <Banknote className="h-4 w-4" />
                  <span>Earnings</span>
                </Link>
              )}

              <Link 
                href="/" 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  pathname === '/' ? 'bg-[#AC244D] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60'
                }`}
              >
                <MapIcon className="h-4 w-4" />
                <span>Map</span>
              </Link>

              <Link 
                href="/bookings" 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  pathname.startsWith('/bookings') ? 'bg-[#AC244D] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60'
                }`}
              >
                <Calendar className="h-4 w-4" />
                <span>Bookings</span>
              </Link>

              <Link 
                href="/messages" 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  pathname.startsWith('/messages') ? 'bg-[#AC244D] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60'
                }`}
              >
                <MessageCircle className="h-4 w-4" />
                <span>Messages</span>
              </Link>

              <Link 
                href="/saved" 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  pathname.startsWith('/saved') ? 'bg-[#AC244D] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60'
                }`}
              >
                <Heart className="h-4 w-4" />
                <span>Saved</span>
              </Link>

              <Link 
                href="/wallet" 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  pathname.startsWith('/wallet') ? 'bg-[#AC244D] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60'
                }`}
              >
                <Wallet className="h-4 w-4" />
                <span>Wallet</span>
              </Link>
              <Link 
                href="/coins" 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  pathname.startsWith('/coins') ? 'bg-[#AC244D] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60'
                }`}
              >
                <Coins className="h-4 w-4" />
                <span>Coins</span>
              </Link>

              <Link 
                href="/perks" 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  pathname.startsWith('/perks') ? 'bg-[#AC244D] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60'
                }`}
              >
                <Trophy className="h-4 w-4" />
                <span>Perks</span>
              </Link>

              <Link 
                href="/profile" 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  pathname.startsWith('/profile') ? 'bg-[#AC244D] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60'
                }`}
              >
                <User className="h-4 w-4" />
                <span>Profile</span>
              </Link>

              {isAdmin && (
                <Link 
                  href="/admin" 
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    pathname.startsWith('/admin') ? 'bg-amber-600 text-white shadow-xs' : 'text-amber-700 hover:bg-amber-50'
                  }`}
                >
                  <ShieldAlert className="h-4 w-4" />
                  <span>Admin</span>
                </Link>
              )}
            </nav>

            <div className="flex items-center gap-3">
              {isModel && (
                <Link 
                  href="/models/live" 
                  className="hidden sm:inline-flex min-h-[44px] items-center gap-1.5 bg-[#AC244D] hover:bg-[#8F1D40] text-white text-xs font-medium px-4 py-2 rounded-full shadow-xs transition-all"
                >
                  <Video className="h-3.5 w-3.5 animate-pulse" />
                  <span>Go Live</span>
                </Link>
              )}

              <NotificationBell />

              <button
                onClick={handleLogout}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center p-2 text-neutral-500 hover:text-[#AC244D] hover:bg-white rounded-full border border-transparent hover:border-neutral-200 transition-all"
                title="Log out"
                aria-label="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main
        className={
          /^\/live\/[^/]+/.test(pathname)
            ? 'mx-auto max-w-7xl px-4 sm:px-6 py-8 pb-24 md:pb-8 lg:mx-0 lg:max-w-none lg:p-0'
            : 'mx-auto max-w-7xl px-4 sm:px-6 py-8 pb-24 md:pb-8'
        }
      >
        {children}
      </main>

      {/* Mobile bottom tab bar: the everyday tabs only. The rest
          live in the More sheet below. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200/80 bg-[#FDF9F6]/95 backdrop-blur-md md:hidden"
      >
        <div className="grid grid-cols-5 px-1 py-1.5">
          {[
            { href: '/dashboard', icon: LayoutDashboard, label: 'Home', active: pathname === '/dashboard' },
            { href: '/live', icon: Radio, label: 'Live', active: pathname.startsWith('/live') },
            { href: '/', icon: MapIcon, label: 'Map', active: pathname === '/' },
            { href: '/messages', icon: MessageCircle, label: 'Messages', active: pathname.startsWith('/messages') },
          ].map(({ href, icon: Icon, label, active }) => (
            <Link
              key={href}
              href={href}
              className={'flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors ' + (active ? 'text-primary' : 'text-neutral-400')}
            >
              <Icon className="h-5 w-5" />
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
    </div>
  )
}
