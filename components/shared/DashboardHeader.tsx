'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, User, Settings, Video, Calendar, LayoutDashboard, Compass } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

export function DashboardHeader() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50 shadow-2xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <span className="bg-gradient-to-r from-[#AC244D] to-[#D43A6B] bg-clip-text text-transparent font-serif">
              Intima
            </span>
          </Link>

          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2 bg-slate-900/60 border border-slate-800/80 px-3 py-1.5 rounded-full backdrop-blur-md">
            <Link 
              href="/dashboard" 
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all"
            >
              <LayoutDashboard className="h-4 w-4 text-[#AC244D]" />
              <span>Dashboard</span>
            </Link>
            
            <Link 
              href="/models/browse" 
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all"
            >
              <Compass className="h-4 w-4 text-[#AC244D]" />
              <span>Browse</span>
            </Link>

            <Link 
              href="/bookings" 
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all"
            >
              <Calendar className="h-4 w-4 text-[#AC244D]" />
              <span>Bookings</span>
            </Link>

            <Link 
              href="/profile" 
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all"
            >
              <Settings className="h-4 w-4 text-[#AC244D]" />
              <span>Profile</span>
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/models/live">
              <Button size="sm" className="bg-[#AC244D] hover:bg-[#8F1D40] text-white shadow-lg shadow-[#AC244D]/25 rounded-xl px-4 py-2.5 font-medium transition-all">
                <Video className="mr-2 h-4 w-4 animate-pulse" />
                Go Live
              </Button>
            </Link>
            
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleLogout} 
              className="text-slate-400 hover:text-white hover:bg-slate-900 rounded-xl px-3 py-2.5 transition-colors"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
