'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { LogOut, User, Calendar, LayoutDashboard, Compass, Wallet, Video, ShieldAlert, Map as MapIcon, Radio, Heart,
  BookOpen,
  Coins,
  Trophy,
  Banknote } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { MobileNav } from '@/components/nav/MobileNav'
import { MessagesFab } from '@/components/nav/MessagesFab'
import { LastSeenHeartbeat } from '@/components/presence/LastSeenHeartbeat'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [userRole, setUserRole] = useState<string>('client')
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

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#FDF9F6] text-[#1A1A1A] font-sans selection:bg-[#AC244D]/20 selection:text-[#AC244D]">
      <header
        className="relative z-40 shrink-0 border-b border-neutral-200/85 bg-[#FDF9F6]/90 backdrop-blur-md"
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
                href="/comics"
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  pathname.startsWith('/comics') ? 'bg-[#AC244D] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60'
                }`}
              >
                <BookOpen className="h-4 w-4" />
                <span>Comics</span>
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
            ? 'mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-y-auto px-4 py-8 sm:px-6 md:pb-8 lg:mx-0 lg:max-w-none lg:p-0'
            : 'mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-y-auto px-4 py-8 sm:px-6 md:pb-8'
        }
      >
        {children}
      </main>

      {/* Mobile bottom tab bar plus More sheet: shared with the
          comics pages via components/nav/MobileNav. The bar
          renders IN FLOW at the bottom of a shell that never
          scrolls (the MamaShop cure), so it is stationed to the
          bottom for good. Messages floats as a FAB with its
          unread count now that Comics holds the bar slot. */}
      <MobileNav />
      <MessagesFab />
      <LastSeenHeartbeat />
    </div>
  )
}
