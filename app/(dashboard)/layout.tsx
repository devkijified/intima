'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { LogOut, User, Calendar, LayoutDashboard, Compass, Wallet, Video, ShieldAlert, Map as MapIcon, Radio, Heart,
  MessageCircle,
  Coins,
  Banknote, Bell } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { NotificationBell } from '@/components/notifications/NotificationBell'

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
      <div className="min-h-screen bg-[#FDF9F6] flex items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#AC244D] border-t-transparent"></div>
      </div>
    )
  }

  const isModel = userRole === 'model'
  const isAdmin = userRole === 'admin' || userRole === 'super_admin'

  return (
    <div className="min-h-screen bg-[#FDF9F6] text-[#1A1A1A] font-sans selection:bg-[#AC244D]/20 selection:text-[#AC244D]">
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
                  className="hidden sm:inline-flex items-center gap-1.5 bg-[#AC244D] hover:bg-[#8F1D40] text-white text-xs font-medium px-4 py-2 rounded-full shadow-xs transition-all"
                >
                  <Video className="h-3.5 w-3.5 animate-pulse" />
                  <span>Go Live</span>
                </Link>
              )}

              <NotificationBell />

              <button 
                onClick={handleLogout} 
                className="p-2 text-neutral-500 hover:text-[#AC244D] hover:bg-white rounded-full border border-transparent hover:border-neutral-200 transition-all"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 pb-24 md:pb-8">
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200/80 bg-[#FDF9F6]/95 backdrop-blur-md md:hidden"
      >
        <div className="grid grid-cols-6 px-1 py-1.5">
          {[
            { href: '/dashboard', icon: LayoutDashboard, label: 'Home', active: pathname === '/dashboard' },
            { href: '/live', icon: Radio, label: 'Live', active: pathname.startsWith('/live') },
            { href: '/', icon: MapIcon, label: 'Map', active: pathname === '/' },
            { href: '/channel', icon: Bell, label: 'Channel', active: pathname.startsWith('/channel') },
            { href: '/saved', icon: Heart, label: 'Saved', active: pathname.startsWith('/saved') },
            { href: '/profile', icon: User, label: 'Profile', active: pathname.startsWith('/profile') },
          ].map(({ href, icon: Icon, label, active }) => (
            <Link
              key={href}
              href={href}
              className={'flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-colors ' + (active ? 'text-primary' : 'text-neutral-400')}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  )
}
