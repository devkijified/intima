import { createClient } from '@/lib/supabase/server'
import { MobileNav } from '@/components/nav/MobileNav'

/**
 * Comics pages live outside the dashboard shell, so signed-in
 * readers get the shared mobile bar here in its fixed variant,
 * Comics badge included. Guests keep the plain pages. The pages
 * already carry generous bottom padding (pb-24 and up), so the
 * fixed bar never covers content, the reader included.
 */
export default async function ComicsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <>
      {children}
      {user && <MobileNav variant="fixed" />}
    </>
  )
}
