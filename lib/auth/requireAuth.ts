import { createClient } from '@/lib/supabase/client'

/**
 * Gate for actions that need an account, requesting a connection
 * first among them. Signed in: returns true and the caller
 * proceeds. Guest: routes to login with a return path back to
 * where they tapped, and returns false.
 */
export async function requireAuth(
  router: { push: (href: string) => void },
  nextPath: string
): Promise<boolean> {
  const { data: { user } } = await createClient().auth.getUser()
  if (user) return true
  router.push(`/login?next=${encodeURIComponent(nextPath)}`)
  return false
}
