import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Banknote, LayoutDashboard, Users, UserCheck, Video, Flag, Settings, LogOut, Radio, Mail, BookOpen, ShieldAlert, AlertTriangle, Lock } from '@/lib/icons'
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

  // Admin if: row in admin_users, or profile role is admin / super_admin.
  const [{ data: adminRow }, { data: profile }] = await Promise.all([
    supabase.from('admin_users').select('user_id').eq('user_id', session.user.id).maybeSingle(),
    supabase.from('profiles').select('role').eq('id', session.user.id).single(),
  ])

  const roleIsAdmin = !!profile && ['admin', 'super_admin'].includes(profile.role)
  if (!adminRow && !roleIsAdmin) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/admin" className="text-2xl font-bold text-[#AC244D]">
              Intima Admin
            </Link>
            <nav className="flex items-center space-x-6">
              <Link href="/admin" className="text-gray-600 hover:text-[#AC244D] transition-colors" title="Dashboard">
                <LayoutDashboard className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/users" className="text-gray-600 hover:text-[#AC244D] transition-colors" title="Users">
                <Users className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/verifications" className="text-gray-600 hover:text-[#AC244D] transition-colors" title="Verifications">
                <UserCheck className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/reports" className="text-gray-600 hover:text-[#AC244D] transition-colors" title="Reports">
                <Flag className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/errors" className="text-gray-600 hover:text-[#AC244D] transition-colors" title="Errors">
                <AlertTriangle className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/models" className="text-gray-600 hover:text-[#AC244D] transition-colors" title="Models">
                <Video className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/live" className="text-gray-600 hover:text-[#AC244D] transition-colors" title="Live streams">
                <Radio className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/comics" className="text-gray-600 hover:text-[#AC244D] transition-colors" title="Comics">
                <BookOpen className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/snaps" className="text-gray-600 hover:text-[#AC244D] transition-colors" title="Fans Only review">
                <Lock className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/cashouts" className="text-gray-600 hover:text-[#AC244D] transition-colors" title="Cash-outs">
                <Banknote className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/disputes" className="text-gray-600 hover:text-[#AC244D] transition-colors" title="Fee disputes">
                <ShieldAlert className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/email-setup" className="text-gray-600 hover:text-[#AC244D] transition-colors" title="Email setup">
                <Mail className="inline h-5 w-5" />
              </Link>
              <Link href="/admin/settings" className="text-gray-600 hover:text-[#AC244D] transition-colors" title="Settings">
                <Settings className="inline h-5 w-5" />
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
