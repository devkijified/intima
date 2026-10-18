import { createClient } from '@/lib/supabase/client'

/**
 * Client-side admin check. A user counts as admin when they have a row in
 * admin_users, or when their profile role is admin or super_admin.
 * Returns false (never throws) for signed-out users or query failures,
 * so gating UI stays fail-closed.
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false

    const [{ data: adminRow }, { data: profile }] = await Promise.all([
      supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    ])

    if (adminRow) return true
    return profile?.role === 'admin' || profile?.role === 'super_admin'
  } catch {
    return false
  }
}
