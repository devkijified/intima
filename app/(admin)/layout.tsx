import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminRail } from '@/components/admin/AdminRail'

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
      <AdminRail />
      <div className="pl-16">
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
