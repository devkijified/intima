'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { LogOut, User, Calendar, LayoutDashboard, Compass, Wallet, Video, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role) {
        setUserRole(profile.role)
      }
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
      {/* Tryst-Inspired Minimal Sticky Navigation Header */}
      <header className="border-b border-neutral-200/85 bg-[#FDF9F6]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3.5">
          <div className="flex items-center justify-between">
            
            {/* Brand Logo */}
            <Link href="/dashboard" className="text-2xl font-serif tracking-tight text-[#AC244D]">
              Intima
            </Link>

            {/* Navigation Links */}
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
                href="/models/browse" 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  pathname.startsWith('/models/browse') ? 'bg-[#AC244D] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60'
                }`}
              >
                <Compass className="h-4 w-4" />
                <span>Browse</span>
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
                href="/wallet" 
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  pathname.startsWith('/wallet') ? 'bg-[#AC244D] text-white shadow-xs' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/60'
                }`}
              >
                <Wallet className="h-4 w-4" />
                <span>Wallet</span>
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

            {/* Right Action Icons / Logout */}
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

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  )
}
