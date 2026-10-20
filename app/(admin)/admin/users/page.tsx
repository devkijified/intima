'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Search, ShieldCheck, UserX } from '@/lib/icons'

interface UserRow {
  id: string
  display_name: string | null
  username: string | null
  role: string
  is_verified: boolean
  created_at: string
}

/**
 * Admin > Users. Real list with search, verification state, and the
 * ability to mark a user as suspended (verification_status = rejected).
 * Suspension removes them from public surfaces that filter on status.
 */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const supabase = createClient()

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, username, role, is_verified, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    setUsers((data ?? []) as UserRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = users.filter((u) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (u.display_name ?? '').toLowerCase().includes(q)
      || (u.username ?? '').toLowerCase().includes(q)
      || u.role.includes(q)
  })

  async function toggleSuspend(u: UserRow) {
    if (!confirm(`Mark ${u.display_name ?? u.username ?? 'this user'} as suspended? They will disappear from public listings.`)) return
    setActing(u.id)
    await supabase.from('profiles').update({ verification_status: 'rejected' }).eq('id', u.id)
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
    await supabase.from('profiles').update({ verification_status: 'unverified' }).eq('id', u.id)
    setActing(null)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-charcoal">Users</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, username, role..."
            className="pl-9"
          />
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-neutral-500">Loading users…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-neutral-500">No users found.</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {filtered.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-charcoal">
                      {u.display_name ?? u.username ?? 'Unnamed'}
                      {u.is_verified && <ShieldCheck className="ml-1 inline h-4 w-4 text-primary" />}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {u.username ? `@${u.username}` : ''} · {u.role} · joined {new Date(u.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {u.role !== 'super_admin' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={acting === u.id}
                      onClick={() => toggleSuspend(u)}
                      className="text-red-600"
                    >
                      <UserX className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-neutral-400">
        Suspension marks verification as rejected, which hides the user from public listings.
      </p>
    </div>
  )
}
