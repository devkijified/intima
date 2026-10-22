'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Banknote, LayoutDashboard, Users, UserCheck, Heart, Flag, Settings,
  LogOut, Radio, Mail, BookOpen, ShieldAlert, AlertTriangle, Lock,
  Trophy, Chart, ListChecks, Gift, Home, Tag, Ticket,
} from '@/lib/icons'
import { Tooltip } from '@/components/ui/Tooltip'
import { createClient } from '@/lib/supabase/client'
import { formatCompactCount } from '@/lib/utils/helpers'

const ADMIN_NAV = [
  { href: '/admin', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/admin/analytics', label: 'Analytics', Icon: Chart },
  { href: '/admin/users', label: 'Users', Icon: Users },
  { href: '/admin/verifications', label: 'Verifications', Icon: UserCheck },
  { href: '/admin/reports', label: 'Reports', Icon: Flag },
  { href: '/admin/errors', label: 'Errors', Icon: AlertTriangle },
  { href: '/admin/models', label: 'Companions', Icon: Heart },
  { href: '/admin/live', label: 'Live streams', Icon: Radio },
  { href: '/admin/comics', label: 'Comics', Icon: BookOpen },
  { href: '/admin/snaps', label: 'Fans Only review', Icon: Lock },
  { href: '/admin/perks', label: 'Perks contests', Icon: Trophy },
  { href: '/admin/board', label: 'Request board', Icon: ListChecks },
  { href: '/admin/cashouts', label: 'Cash-outs', Icon: Banknote },
  { href: '/admin/gifts', label: 'Gift store', Icon: Gift },
  { href: '/admin/services', label: 'Services, vibes and cities', Icon: Tag },
  { href: '/admin/disputes', label: 'Fee disputes', Icon: ShieldAlert },
  { href: '/admin/tickets', label: 'Support tickets', Icon: Ticket },
  { href: '/admin/email-setup', label: 'Email setup', Icon: Mail },
  { href: '/admin/settings', label: 'Settings', Icon: Settings },
]

/**
 * How many items are waiting in each queue, read exactly the way
 * each queue page reads its own waiting work:
 * verifications status 'pending', reports status 'open', disputes
 * the API's open list (connections with fee_state 'disputed'),
 * cash-outs status 'pending', Fans Only the review queue itself,
 * perks pendingEntries, board requests still 'open', support
 * tickets status 'open'. A failed count simply shows no badge.
 */
async function fetchQueueCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  const supabase = createClient()
  const json = async (url: string): Promise<Record<string, unknown> | null> => {
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      return (await res.json()) as Record<string, unknown>
    } catch {
      return null
    }
  }
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0)

  const [verifications, reports, disputes, cashouts, snaps, perks, board, tickets] =
    await Promise.all([
      supabase.from('verifications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      json('/api/admin/disputes'),
      json('/api/admin/cashouts?status=pending'),
      json('/api/admin/snaps'),
      json('/api/admin/perks'),
      json('/api/admin/board'),
      json('/api/tickets?status=open'),
    ])

  if (typeof verifications.count === 'number') counts['/admin/verifications'] = verifications.count
  if (typeof reports.count === 'number') counts['/admin/reports'] = reports.count
  if (disputes) counts['/admin/disputes'] = len(disputes.open)
  if (cashouts) counts['/admin/cashouts'] = len(cashouts.requests)
  if (snaps) counts['/admin/snaps'] = len(snaps.snaps)
  if (perks) counts['/admin/perks'] = len(perks.pendingEntries)
  if (board) {
    counts['/admin/board'] = (Array.isArray(board.requests) ? board.requests : [])
      .filter((r) => (r as { status?: string }).status === 'open').length
  }
  if (tickets) counts['/admin/tickets'] = len(tickets.tickets)
  return counts
}

/**
 * Admin navigation as a slim left icon rail, Muse desktop style:
 * icons only, the label rides in a tooltip on the right, the current
 * section wears a burgundy pill, queue counts ride as small burgundy
 * pills on the icons where work is waiting, and log out sits at the
 * bottom. The rail is fixed; the layout reserves its width.
 */
export function AdminRail() {
  const pathname = usePathname()
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let live = true
    fetchQueueCounts().then((c) => { if (live) setCounts(c) }).catch(() => {})
    return () => { live = false }
  }, [pathname])

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
          const count = counts[href] ?? 0
          return (
            <Tooltip key={href} label={count > 0 ? `${label} · ${formatCompactCount(count)} waiting` : label} side="right">
              <Link
                href={href}
                aria-label={count > 0 ? `${label}, ${count} waiting` : label}
                aria-current={active ? 'page' : undefined}
                className={`relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-colors ${
                  active
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-gray-500 hover:bg-primary-muted hover:text-primary'
                }`}
              >
                <Icon className="h-5 w-5" />
                {count > 0 && (
                  <span
                    aria-hidden
                    className={`absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ring-2 ${
                      active ? 'bg-white text-primary ring-primary' : 'bg-primary text-white ring-white'
                    }`}
                  >
                    {formatCompactCount(count)}
                  </span>
                )}
              </Link>
            </Tooltip>
          )
        })}
      </nav>
      <Tooltip label="Back to the app" side="right">
        <Link
          href="/dashboard"
          aria-label="Back to the app dashboard"
          className="mt-2 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-primary-muted hover:text-primary"
        >
          <Home className="h-5 w-5" />
        </Link>
      </Tooltip>
      <Tooltip label="Log out" side="right">
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Log out"
          className="mt-1 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-primary-muted hover:text-primary"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </Tooltip>
    </aside>
  )
}
