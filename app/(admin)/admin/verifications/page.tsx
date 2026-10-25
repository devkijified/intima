'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin/isAdmin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ShieldAlert, CheckCircle2, XCircle, Loader2, ExternalLink } from '@/lib/icons'
import { VerifiedBadge } from '@/components/admin/VerifiedBadge'

interface VerificationRow {
  id: string
  provider_id: string
  status: 'pending' | 'approved' | 'rejected'
  id_document_url: string | null
  selfie_url: string | null
  sign_selfie_url: string | null
  id_type: string | null
  submitted_at: string
  review_notes: string | null
  automation_status: string | null
  provider: string | null
  provider_confidence: number | string | null
  decision_source: string | null
  profiles: { display_name: string | null; full_name: string | null } | null
}

export default function AdminVerificationsPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [diditMode, setDiditMode] = useState<'sandbox' | 'live' | null>(null)
  const [rows, setRows] = useState<VerificationRow[]>([])
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({})
  const [acting, setActing] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const supabase = createClient()

  async function load() {
    // No FK from verifications.provider_id to profiles exists for
    // PostgREST to embed (PGRST200: the embed 400s and the queue
    // renders empty), so fetch rows plainly and resolve provider
    // names with a second query, the bookings/wallet pattern.
    const { data } = await supabase
      .from('verifications')
      .select(
        'id, provider_id, status, id_document_url, selfie_url, sign_selfie_url, id_type, submitted_at, review_notes, automation_status, provider, provider_confidence, decision_source'
      )
      .order('submitted_at', { ascending: true })
    if (data) {
      const list = data as unknown as VerificationRow[]
      const providerIds = Array.from(new Set(list.map((r) => r.provider_id).filter(Boolean)))
      if (providerIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, full_name')
          .in('id', providerIds)
        const nameBy: Record<string, { display_name: string | null; full_name: string | null }> = {}
        for (const p of (profs ?? []) as { id: string; display_name: string | null; full_name: string | null }[]) {
          nameBy[p.id] = { display_name: p.display_name, full_name: p.full_name }
        }
        for (const r of list) r.profiles = nameBy[r.provider_id] ?? null
      }
      // New submissions store private storage paths, not public URLs:
      // sign them so the review team can open the documents.
      await Promise.all(list.map(async (r) => {
        for (const k of ['id_document_url', 'selfie_url', 'sign_selfie_url'] as const) {
          const v = r[k]
          if (v && !v.startsWith('http')) {
            const { data: signed } = await supabase.storage
              .from('verification-docs')
              .createSignedUrl(v, 3600)
            if (signed) r[k] = signed.signedUrl
          }
        }
      }))
      setRows(list)
    }
  }

  useEffect(() => {
    async function init() {
      const ok = await isAdmin()
      setAuthorized(ok)
      if (ok) {
        await load()
        try {
          const res = await fetch('/api/admin/didit-mode')
          const data = (await res.json().catch(() => null)) as { mode?: string } | null
          if (data?.mode === 'live' || data?.mode === 'sandbox') setDiditMode(data.mode)
        } catch {
          // The badge is informational; the queue works without it.
        }
      }
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
      // Decisions go through the server route: it performs the same
      // writes (verification row, profile sync, audit log) and then
      // notifies the companion, which the browser cannot do itself.
      const res = await fetch('/api/admin/verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, approve, notes }),
      })
      const data = (await res.json().catch(() => null)) as
        | { error?: string; status?: string }
        | null
      if (!res.ok) throw new Error(data?.error ?? 'Action failed')

      await load()
      setNotice(`Verification ${data?.status ?? (approve ? 'approved' : 'rejected')}.`)
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
        <ShieldAlert aria-hidden className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h1 className="font-display text-xl font-semibold tracking-tight text-gray-900">Not authorized</h1>
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
      <h1 className="font-display text-2xl font-semibold tracking-tight text-gray-900 mb-2">Verification Queue</h1>
      <p className="text-gray-600 mb-6">
        Every provider badge is earned here. Approve only after the ID and selfie genuinely match.
      </p>

      {diditMode && (
        <div
          className={`mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
            diditMode === 'live'
              ? 'bg-green-100 text-green-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${diditMode === 'live' ? 'bg-green-600' : 'bg-amber-500'}`}
          />
          {diditMode === 'live'
            ? 'Didit is LIVE: instant verdicts are real checks'
            : 'Didit is in TEST MODE: instant verdicts are simulated'}
        </div>
      )}

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

      <div className="scroll-row mb-4 gap-2 pb-1">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
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
              No {filter} verifications.
            </CardContent>
          </Card>
        )}
        {visible.map((row) => (
          <Card key={row.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {row.profiles?.display_name || row.profiles?.full_name || 'Unnamed companion'}
                {row.status === 'approved' && <VerifiedBadge className="ml-2" />}
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
                    className="flex min-h-[44px] items-center gap-1 text-sm text-primary hover:text-primary-dark"
                  >
                    <ExternalLink aria-hidden className="w-4 h-4" /> ID document
                  </a>
                ) : (
                  <span className="text-sm text-gray-400">No ID document</span>
                )}
                {row.selfie_url ? (
                  <a
                    href={row.selfie_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-[44px] items-center gap-1 text-sm text-primary hover:text-primary-dark"
                  >
                    <ExternalLink aria-hidden className="w-4 h-4" /> Selfie
                  </a>
                ) : (
                  <span className="text-sm text-gray-400">No selfie</span>
                )}
                {row.sign_selfie_url ? (
                  <a
                    href={row.sign_selfie_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-[44px] items-center gap-1 text-sm text-primary hover:text-primary-dark"
                  >
                    <ExternalLink aria-hidden className="w-4 h-4" /> Sign selfie
                  </a>
                ) : (
                  <span className="text-sm text-gray-400">No sign selfie</span>
                )}
                {row.id_type && (
                  <span className="text-xs font-medium text-gray-500">ID: {row.id_type}</span>
                )}
              </div>

              {row.automation_status && row.automation_status !== 'not_started' && (
                <p className="mb-3 text-xs text-gray-500">
                  Auto check{row.provider ? ` (${row.provider})` : ''}:{' '}
                  {row.automation_status.replace(/_/g, ' ')}
                  {row.provider_confidence !== null && row.provider_confidence !== undefined
                    ? `, face match ${Math.round(Number(row.provider_confidence))}%`
                    : ''}
                  {row.decision_source
                    ? `, source: ${row.decision_source === 'admin' ? 'review team' : row.decision_source}`
                    : ''}
                </p>
              )}

              {row.status === 'pending' ? (
                <div className="space-y-3">
                  <input
                    value={rejectNotes[row.id] ?? ''}
                    onChange={(e) =>
                      setRejectNotes((n) => ({ ...n, [row.id]: e.target.value }))
                    }
                    placeholder="Review note (required when rejecting)"
                    className="min-h-[44px] w-full border border-gray-300 rounded-xl px-3 py-2 text-base md:text-sm"
                  />
                  <div className="flex gap-3">
                    <Button
                      onClick={() => decide(row.id, true)}
                      disabled={acting === row.id}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {acting === row.id ? (
                        <Loader2 aria-hidden className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 aria-hidden className="w-4 h-4 mr-2" />
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
                        <Loader2 aria-hidden className="w-4 h-4 animate-spin" />
                      ) : (
                        <XCircle aria-hidden className="w-4 h-4 mr-2" />
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
