'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin/isAdmin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ShieldAlert, CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react'

interface VerificationRow {
  id: string
  provider_id: string
  status: 'pending' | 'approved' | 'rejected'
  id_document_url: string | null
  selfie_url: string | null
  submitted_at: string
  review_notes: string | null
  profiles: { display_name: string | null; full_name: string | null } | null
}

export default function AdminVerificationsPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [rows, setRows] = useState<VerificationRow[]>([])
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({})
  const [acting, setActing] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const supabase = createClient()

  async function load() {
    const { data } = await supabase
      .from('verifications')
      .select(
        'id, provider_id, status, id_document_url, selfie_url, submitted_at, review_notes, profiles:provider_id (display_name, full_name)'
      )
      .order('submitted_at', { ascending: true })
    if (data) setRows(data as unknown as VerificationRow[])
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

  async function decide(id: string, approve: boolean) {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    const notes = (rejectNotes[id] ?? '').trim()
    if (!approve && !notes) {
      setNotice('A reason is required when rejecting a verification.')
      return
    }

    setActing(id)
    setNotice('')
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      const status = approve ? 'approved' : 'rejected'
      const { error } = await supabase
        .from('verifications')
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: approve ? notes || null : notes,
        })
        .eq('id', id)
      if (error) throw error

      // Keep the public profile in sync. A badge must never show before approval.
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          verification_status: approve ? 'verified' : 'rejected',
          is_verified: approve,
        })
        .eq('id', row.provider_id)
      if (profileError) throw profileError

      await supabase.from('admin_audit_logs').insert({
        admin_id: user.id,
        action: approve ? 'verification_approved' : 'verification_rejected',
        target_type: 'verification',
        target_id: id,
        details: { provider_id: row.provider_id, notes: notes || null },
      })

      await load()
      setNotice(`Verification ${status}.`)
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

  const counts = {
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
  }
  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Verification Queue</h1>
      <p className="text-gray-600 mb-6">
        Every provider badge is earned here. Approve only after the ID and selfie genuinely match.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <Card key={s}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-charcoal">{counts[s]}</p>
              <p className="text-xs text-gray-500 capitalize">{s}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
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
              No {filter} verifications.
            </CardContent>
          </Card>
        )}
        {visible.map((row) => (
          <Card key={row.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {row.profiles?.display_name || row.profiles?.full_name || 'Unnamed provider'}
                <span className="ml-2 text-xs font-normal text-gray-500">
                  submitted {new Date(row.submitted_at).toLocaleString()}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 mb-4">
                {row.id_document_url ? (
                  <a
                    href={row.id_document_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:text-primary-dark flex items-center gap-1"
                  >
                    <ExternalLink className="w-4 h-4" /> ID document
                  </a>
                ) : (
                  <span className="text-sm text-gray-400">No ID document</span>
                )}
                {row.selfie_url ? (
                  <a
                    href={row.selfie_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:text-primary-dark flex items-center gap-1"
                  >
                    <ExternalLink className="w-4 h-4" /> Selfie
                  </a>
                ) : (
                  <span className="text-sm text-gray-400">No selfie</span>
                )}
              </div>

              {row.status === 'pending' ? (
                <div className="space-y-3">
                  <input
                    value={rejectNotes[row.id] ?? ''}
                    onChange={(e) =>
                      setRejectNotes((n) => ({ ...n, [row.id]: e.target.value }))
                    }
                    placeholder="Review note (required when rejecting)"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                  />
                  <div className="flex gap-3">
                    <Button
                      onClick={() => decide(row.id, true)}
                      disabled={acting === row.id}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {acting === row.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      )}
                      Approve
                    </Button>
                    <Button
                      onClick={() => decide(row.id, false)}
                      disabled={acting === row.id}
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                    >
                      {acting === row.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <XCircle className="w-4 h-4 mr-2" />
                      )}
                      Reject
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  {row.status === 'approved' ? 'Approved' : 'Rejected'}
                  {row.review_notes ? `, note: ${row.review_notes}` : ''}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
