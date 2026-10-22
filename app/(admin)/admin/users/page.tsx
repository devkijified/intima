'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { VerifiedBadge } from '@/components/admin/VerifiedBadge'
import { formatCompactCount } from '@/lib/utils/helpers'
import { Search, ShieldCheck, UserX } from '@/lib/icons'

interface UserRow {
  id: string
  display_name: string | null
  username: string | null
  role: string
  avatar_url: string | null
  is_verified: boolean
  is_hidden: boolean
  created_at: string
}

type RoleFilter = 'all' | 'client' | 'model' | 'admin'
type VerifiedFilter = 'all' | 'verified' | 'unverified' | 'pending'
type SortKey = 'newest' | 'oldest' | 'name'

const ROLE_LABEL: Record<string, string> = {
  client: 'Client',
  model: 'Companion',
  admin: 'Admin',
  super_admin: 'Admin',
}

function initialsOf(u: UserRow): string {
  const base = (u.display_name ?? u.username ?? '?').trim()
  const parts = base.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

/**
 * Admin > Users. A grid of user cards with the total stated up top,
 * per-role tallies, and working search, role, verification and sort
 * filters. Suspend/restore flips profiles.is_hidden (and the map
 * presence with it): the account disappears from public surfaces
 * while its verification record stays exactly as it was, so
 * restoring brings the person back whole. "Pending" reads the
 * verification queue: a member with a submission still waiting.
 */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [verifiedFilter, setVerifiedFilter] = useState<VerifiedFilter>('all')
  const [sort, setSort] = useState<SortKey>('newest')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<UserRow | null>(null)
  const supabase = createClient()

  async function load() {
    setLoading(true)
    const [{ data }, { data: pending }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, username, role, avatar_url, is_verified, is_hidden, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('verifications').select('provider_id').eq('status', 'pending'),
    ])
    setUsers((data ?? []) as UserRow[])
    setPendingIds(new Set(((pending ?? []) as { provider_id: string }[]).map((r) => r.provider_id)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const tallies = useMemo(() => ({
    total: users.length,
    clients: users.filter((u) => u.role === 'client').length,
    companions: users.filter((u) => u.role === 'model').length,
    admins: users.filter((u) => u.role === 'admin' || u.role === 'super_admin').length,
  }), [users])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = users.filter((u) => {
      if (q) {
        const hit = (u.display_name ?? '').toLowerCase().includes(q)
          || (u.username ?? '').toLowerCase().includes(q)
          || u.role.includes(q)
        if (!hit) return false
      }
      if (roleFilter === 'admin') {
        if (u.role !== 'admin' && u.role !== 'super_admin') return false
      } else if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (verifiedFilter === 'verified' && !u.is_verified) return false
      if (verifiedFilter === 'unverified' && (u.is_verified || pendingIds.has(u.id))) return false
      if (verifiedFilter === 'pending' && (u.is_verified || !pendingIds.has(u.id))) return false
      return true
    })
    const sorted = [...rows]
    if (sort === 'oldest') sorted.sort((a, b) => a.created_at.localeCompare(b.created_at))
    else if (sort === 'name') {
      sorted.sort((a, b) =>
        (a.display_name ?? a.username ?? '').localeCompare(b.display_name ?? b.username ?? ''))
    } else {
      sorted.sort((a, b) => b.created_at.localeCompare(a.created_at))
    }
    return sorted
  }, [users, query, roleFilter, verifiedFilter, sort, pendingIds])

  function toggleSuspend(u: UserRow) {
    setSuspendTarget(u)
  }

  async function doSuspend(u: UserRow) {
    setSuspendTarget(null)
    setActing(u.id)
    await supabase.from('profiles').update({ is_hidden: true }).eq('id', u.id)
    await supabase.from('provider_presence').update({ show_on_map: false }).eq('provider_id', u.id)
    await supabase.from('admin_audit_logs').insert({
      action: 'user_suspended',
      target_id: u.id,
      details: `Suspended user ${u.display_name ?? u.id}`,
    })
    setActing(null)
    load()
  }

  async function restore(u: UserRow) {
    setActing(u.id)
    await supabase.from('profiles').update({ is_hidden: false }).eq('id', u.id)
    await supabase.from('provider_presence').update({ show_on_map: true }).eq('provider_id', u.id)
    await supabase.from('admin_audit_logs').insert({
      action: 'user_restored',
      target_id: u.id,
      details: `Restored user ${u.display_name ?? u.id}`,
    })
    setActing(null)
    load()
  }

  const chipCls = (active: boolean) =>
    `inline-flex min-h-[44px] items-center rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
      active ? 'bg-primary text-white' : 'bg-white text-neutral-600 ring-1 ring-black/[0.06] hover:bg-cream'
    }`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-charcoal">Users</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {loading ? 'Counting users…' : (
              <>
                {tallies.total.toLocaleString()} users · {formatCompactCount(tallies.clients)} clients ·{' '}
                {formatCompactCount(tallies.companions)} companions · {formatCompactCount(tallies.admins)} admins
              </>
            )}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or username..."
            className="w-full pl-9"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([
          ['all', 'All roles'],
          ['client', 'Clients'],
          ['model', 'Companions'],
          ['admin', 'Admins'],
        ] as [RoleFilter, string][]).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setRoleFilter(key)} className={chipCls(roleFilter === key)}>
            {label}
          </button>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-neutral-200 sm:block" />
        {([
          ['all', 'Any verification'],
          ['verified', 'Verified'],
          ['unverified', 'Unverified'],
          ['pending', 'Pending review'],
        ] as [VerifiedFilter, string][]).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setVerifiedFilter(key)} className={chipCls(verifiedFilter === key)}>
            {label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-[13px] font-medium text-neutral-500">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="min-h-[44px] rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-charcoal ring-1 ring-black/[0.06] outline-none focus:ring-primary"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A to Z</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p className="p-6 text-sm text-neutral-500">Loading users…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-sm text-neutral-500 ring-1 ring-black/[0.04]">
          No users match those filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((u) => (
            <div key={u.id} className="min-w-0 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.04]">
              <div className="flex items-start gap-3">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {initialsOf(u)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="min-w-0 truncate text-sm font-semibold text-charcoal">
                      {u.display_name ?? u.username ?? 'Unnamed'}
                    </span>
                    {u.is_verified && <VerifiedBadge />}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {u.username ? `@${u.username}` : 'No username yet'}
                  </p>
                </div>
                {u.role !== 'super_admin' && (
                  u.is_hidden ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={acting === u.id}
                      onClick={() => restore(u)}
                      aria-label="Restore user"
                      className="shrink-0"
                    >
                      <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={acting === u.id}
                      onClick={() => toggleSuspend(u)}
                      aria-label="Suspend user"
                      className="shrink-0 text-red-600"
                    >
                      <UserX aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                  )
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                <span className="rounded-full bg-cream px-2.5 py-1 font-semibold text-charcoal ring-1 ring-black/[0.05]">
                  {ROLE_LABEL[u.role] ?? u.role}
                </span>
                {!u.is_verified && pendingIds.has(u.id) && (
                  <span className="rounded-full bg-[#C9A84C]/20 px-2.5 py-1 font-semibold text-[#8a6d2a]">
                    Verification pending
                  </span>
                )}
                {u.is_hidden && <span className="font-semibold text-amber-600">SUSPENDED</span>}
                <span className="ml-auto">Joined {new Date(u.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-neutral-400">
        Suspension hides the user from public listings. Their verification record is untouched, so restoring brings them back exactly as they were.
      </p>
      <ConfirmDialog
        open={suspendTarget !== null}
        title={`Suspend ${suspendTarget?.display_name ?? suspendTarget?.username ?? 'this user'}?`}
        body="They will disappear from public listings until restored."
        confirmLabel="Suspend"
        busy={acting !== null}
        onCancel={() => setSuspendTarget(null)}
        onConfirm={() => { if (suspendTarget) void doSuspend(suspendTarget) }}
      />
    </div>
  )
}
