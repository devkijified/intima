import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Users, UserCheck, Video, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/admin" className="text-2xl font-bold text-[#AC244D]">
              Intima Admin
            </Link>
            <nav className="flex items-center space-x-6">
              <Link href="/admin" className="text-gray-600 hover:text-[#AC244D] transition-colors">
                <LayoutDashboard className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/users" className="text-gray-600 hover:text-[#AC244D] transition-colors">
                <Users className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/verifications" className="text-gray-600 hover:text-[#AC244D] transition-colors">
                <UserCheck className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/models" className="text-gray-600 hover:text-[#AC244D] transition-colors">
                <Video className="inline h-5 w-5" />
              </Link>
              <Button variant="ghost" size="sm">
                <LogOut className="h-5 w-5 text-gray-600" />
              </Button>
            </nav>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        {children}
      </main>
    </div>
  )
}
