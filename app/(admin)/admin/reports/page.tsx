'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin/isAdmin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ShieldAlert, CheckCircle2, XCircle, Loader2, Flag } from '@/lib/icons'

interface ReportRow {
  id: string
  reporter_id: string
  reported_provider_id: string
  reason: string
  details: string | null
  status: 'open' | 'resolved' | 'dismissed'
  created_at: string
  reporter: { display_name: string | null; full_name: string | null } | null
  reported: { display_name: string | null; full_name: string | null } | null
}

export default function AdminReportsPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [rows, setRows] = useState<ReportRow[]>([])
  const [filter, setFilter] = useState<'open' | 'resolved' | 'dismissed' | 'all'>('open')
  const [acting, setActing] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const supabase = createClient()

  async function load() {
    // No FKs from reports to profiles exist for PostgREST to embed
    // (PGRST200: the embed 400s and the queue renders empty), so
    // fetch rows plainly and resolve both names with a second query.
    const { data } = await supabase
      .from('reports')
      .select('id, reporter_id, reported_provider_id, reason, details, status, created_at')
      .order('created_at', { ascending: false })
    if (data) {
      const list = data as unknown as ReportRow[]
      const ids = Array.from(
        new Set(list.flatMap((r) => [r.reporter_id, r.reported_provider_id]).filter(Boolean))
      )
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, full_name')
          .in('id', ids)
        const nameBy: Record<string, { display_name: string | null; full_name: string | null }> = {}
        for (const p of (profs ?? []) as { id: string; display_name: string | null; full_name: string | null }[]) {
          nameBy[p.id] = { display_name: p.display_name, full_name: p.full_name }
        }
        for (const r of list) {
          r.reporter = nameBy[r.reporter_id] ?? null
          r.reported = nameBy[r.reported_provider_id] ?? null
        }
      }
      setRows(list)
    }
  }

  useEffect(() => {
    async function init() {
      const ok = await isAdmin()
      setAuthorized(ok)
      if (ok) await load()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function triage(id: string, status: 'resolved' | 'dismissed') {
    setActing(id)
    setNotice('')
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      const { error } = await supabase.from('reports').update({ status }).eq('id', id)
      if (error) throw error

      await supabase.from('admin_audit_logs').insert({
        admin_id: user.id,
        action: status === 'resolved' ? 'report_resolved' : 'report_dismissed',
        target_type: 'report',
        target_id: id,
        details: null,
      })

      await load()
      setNotice(`Report ${status}.`)
    } catch (err) {
      setNotice('That action did not go through. Please try again.')
    } finally {
      setActing(null)
    }
  }

  if (authorized === null) {
    return <div className="text-center py-10">Loading...</div>
  }

  if (!authorized) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <ShieldAlert aria-hidden className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h1 className="font-display text-xl font-semibold tracking-tight text-gray-900">Not authorized</h1>
        <p className="text-gray-600 mt-2">This area is restricted to platform administrators.</p>
      </div>
    )
  }

  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter)

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900 mb-2">Reports</h1>
      <p className="text-gray-600 mb-6">
        User safety reports. Triage quickly, keep the audit trail honest.
      </p>

      <div className="scroll-row mb-4 gap-2 pb-1">
        {(['open', 'resolved', 'dismissed', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`inline-flex min-h-[44px] shrink-0 items-center justify-center whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize ${
              filter === s
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {notice && (
        <div className="mb-4 bg-primary-muted border border-primary/20 text-charcoal text-sm rounded-xl px-4 py-3">
          {notice}
        </div>
      )}

      <div className="space-y-4">
        {visible.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              No {filter} reports.
            </CardContent>
          </Card>
        )}
        {visible.map((row) => (
          <Card key={row.id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Flag aria-hidden className="w-4 h-4 text-primary" />
                {row.reason}
                <span className="ml-auto text-xs font-normal text-gray-500">
                  {new Date(row.created_at).toLocaleString()}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-1">
                Reported:{' '}
                <span className="font-medium text-charcoal">
                  {row.reported?.display_name || row.reported?.full_name || 'Unknown companion'}
                </span>
                {' '}by{' '}
                <span className="font-medium text-charcoal">
                  {row.reporter?.display_name || row.reporter?.full_name || 'Unknown user'}
                </span>
              </p>
              {row.details && (
                <p className="text-sm text-gray-600 mb-3 bg-gray-50 rounded-xl p-3">{row.details}</p>
              )}
              {row.status === 'open' ? (
                <div className="flex gap-3">
                  <Button
                    onClick={() => triage(row.id, 'resolved')}
                    disabled={acting === row.id}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {acting === row.id ? (
                      <Loader2 aria-hidden className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 aria-hidden className="w-4 h-4 mr-2" />
                    )}
                    Resolve
                  </Button>
                  <Button
                    onClick={() => triage(row.id, 'dismissed')}
                    disabled={acting === row.id}
                    variant="outline"
                  >
                    {acting === row.id ? (
                      <Loader2 aria-hidden className="w-4 h-4 animate-spin" />
                    ) : (
                      <XCircle aria-hidden className="w-4 h-4 mr-2" />
                    )}
                    Dismiss
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-gray-500 capitalize">Status: {row.status}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
