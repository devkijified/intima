'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Banknote, LayoutDashboard, Users, UserCheck, Video, Flag, Settings,
  LogOut, Radio, Mail, BookOpen, ShieldAlert, AlertTriangle, Lock,
  Trophy, Chart, ListChecks,
} from '@/lib/icons'
import { Tooltip } from '@/components/ui/Tooltip'
import { createClient } from '@/lib/supabase/client'

const ADMIN_NAV = [
  { href: '/admin', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/admin/analytics', label: 'Analytics', Icon: Chart },
  { href: '/admin/users', label: 'Users', Icon: Users },
  { href: '/admin/verifications', label: 'Verifications', Icon: UserCheck },
  { href: '/admin/reports', label: 'Reports', Icon: Flag },
  { href: '/admin/errors', label: 'Errors', Icon: AlertTriangle },
  { href: '/admin/models', label: 'Companions', Icon: Video },
  { href: '/admin/live', label: 'Live streams', Icon: Radio },
  { href: '/admin/comics', label: 'Comics', Icon: BookOpen },
  { href: '/admin/snaps', label: 'Fans Only review', Icon: Lock },
  { href: '/admin/perks', label: 'Perks contests', Icon: Trophy },
  { href: '/admin/board', label: 'Request board', Icon: ListChecks },
  { href: '/admin/cashouts', label: 'Cash-outs', Icon: Banknote },
  { href: '/admin/disputes', label: 'Fee disputes', Icon: ShieldAlert },
  { href: '/admin/email-setup', label: 'Email setup', Icon: Mail },
  { href: '/admin/settings', label: 'Settings', Icon: Settings },
]

/**
 * Admin navigation as a slim left icon rail, Muse desktop style:
 * icons only, the label rides in a tooltip on the right, the current
 * section wears a burgundy pill, and log out sits at the bottom.
 * The rail is fixed; the layout reserves its width with padding.
 */
export function AdminRail() {
  const pathname = usePathname()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 flex w-16 flex-col items-center border-r border-neutral-200/80 bg-white pb-3"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
    >
      <Link
        href="/admin"
        aria-label="Intima Admin home"
        className="mb-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary font-display text-base font-bold text-white shadow-sm"
      >
        In
      </Link>
      <nav
        aria-label="Admin"
        className="flex flex-1 flex-col items-center gap-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {ADMIN_NAV.map(({ href, label, Icon }) => {
          const active =
            href === '/admin'
              ? pathname === '/admin'
              : pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Tooltip key={href} label={label} side="right">
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-colors ${
                  active
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-gray-500 hover:bg-primary-muted hover:text-primary'
                }`}
              >
                <Icon className="h-5 w-5" />
              </Link>
            </Tooltip>
          )
        })}
      </nav>
      <Tooltip label="Log out" side="right">
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Log out"
          className="mt-2 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-primary-muted hover:text-primary"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </Tooltip>
    </aside>
  )
}
