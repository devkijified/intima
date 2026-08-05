'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, User, Settings, Video, Calendar, LayoutDashboard } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

export function DashboardHeader() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="border-b bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-2xl font-bold text-brand">
            Intima
          </Link>

          <nav className="hidden md:flex items-center space-x-6">
            <Link href="/dashboard" className="text-gray-600 hover:text-brand transition-colors">
              <LayoutDashboard className="inline-block h-5 w-5" />
              <span className="ml-2">Dashboard</span>
            </Link>
            <Link href="/models/browse" className="text-gray-600 hover:text-brand transition-colors">
              <User className="inline-block h-5 w-5" />
              <span className="ml-2">Browse</span>
            </Link>
            <Link href="/bookings" className="text-gray-600 hover:text-brand transition-colors">
              <Calendar className="inline-block h-5 w-5" />
              <span className="ml-2">Bookings</span>
            </Link>
            <Link href="/profile" className="text-gray-600 hover:text-brand transition-colors">
              <Settings className="inline-block h-5 w-5" />
              <span className="ml-2">Profile</span>
            </Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/models/live">
              <Button variant="default" size="sm" className="bg-brand hover:bg-brand-dark">
                <Video className="mr-2 h-4 w-4" />
                Go Live
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-5 w-5 text-gray-600" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
