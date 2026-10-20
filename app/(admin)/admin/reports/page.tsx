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
    const { data } = await supabase
      .from('reports')
      .select(
        `id, reporter_id, reported_provider_id, reason, details, status, created_at,
         reporter:reporter_id (display_name, full_name),
         reported:reported_provider_id (display_name, full_name)`
      )
      .order('created_at', { ascending: false })
    if (data) setRows(data as unknown as ReportRow[])
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
      setNotice(err instanceof Error ? err.message : 'Action failed')
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
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900">Not authorized</h1>
        <p className="text-gray-600 mt-2">This area is restricted to platform administrators.</p>
      </div>
    )
  }

  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Reports</h1>
      <p className="text-gray-600 mb-6">
        User safety reports. Triage quickly, keep the audit trail honest.
      </p>

      <div className="flex gap-2 mb-4 flex-wrap">
        {(['open', 'resolved', 'dismissed', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize ${
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
                <Flag className="w-4 h-4 text-primary" />
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
                  {row.reported?.display_name || row.reported?.full_name || 'Unknown provider'}
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
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                    )}
                    Resolve
                  </Button>
                  <Button
                    onClick={() => triage(row.id, 'dismissed')}
                    disabled={acting === row.id}
                    variant="outline"
                  >
                    {acting === row.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4 mr-2" />
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
