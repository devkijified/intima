'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, User, Calendar, LayoutDashboard } from 'lucide-react'
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
          <Link href="/dashboard" className="text-2xl font-bold text-[#AC244D]">
            Intima
          </Link>

          <nav className="flex items-center space-x-6">
            <Link href="/dashboard" className="text-gray-600 hover:text-[#AC244D]">
              <LayoutDashboard className="inline h-5 w-5" />
            </Link>
            <Link href="/models/browse" className="text-gray-600 hover:text-[#AC244D]">
              <User className="inline h-5 w-5" />
            </Link>
            <Link href="/bookings" className="text-gray-600 hover:text-[#AC244D]">
              <Calendar className="inline h-5 w-5" />
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </nav>
        </div>
      </div>
    </header>
  )
}
