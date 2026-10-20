'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Clock, Lock, XCircle } from '@/lib/icons'

interface PendingSnap {
  id: string
  providerId: string
  providerName: string | null
  providerUsername: string | null
  mediaType: string
  caption: string | null
  collection: string
  durationSeconds: number | null
  createdAt: string
  url: string | null
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = Math.round(totalSeconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatUploaded(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Admin: human review queue for private snaps. Nothing reaches fans or counts toward the fan club rules until it is approved here. */
export default function AdminSnapsPage() {
  const [snaps, setSnaps] = useState<PendingSnap[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    setError('')
    const res = await fetch('/api/admin/snaps')
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      setSnaps(d.snaps ?? [])
    } else {
      setError(d.error ?? 'Could not load the review queue.')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function decide(snap: PendingSnap, decision: 'approved' | 'rejected') {
    if (busyId) return
    setBusyId(snap.id)
    setMsg('')
    const res = await fetch('/api/admin/snaps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snapId: snap.id,
        decision,
        reason: decision === 'rejected' ? reason.trim() : undefined,
      }),
    })
    const d = await res.json().catch(() => ({}))
    setBusyId(null)
    if (res.ok) {
      setSnaps((prev) => prev.filter((s) => s.id !== snap.id))
      setRejectingId(null)
      setReason('')
      setMsg(
        decision === 'approved'
          ? 'Approved. It now counts for the creator and can be seen by fans.'
          : 'Rejected. The creator can be told the reason saved with it.'
      )
    } else {
      setMsg(d.error ?? 'Could not save that decision.')
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Admin
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-muted">
          <Lock className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">Fans Only review</h1>
          <p className="text-sm text-neutral-500">
            Every Fans Only post passes a human check before fans can see it. Oldest first.
          </p>
        </div>
      </div>

      {msg && <p className="mt-4 text-xs text-neutral-600">{msg}</p>}
      {error && (
        <div className="card-luxe mt-6 p-5 text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={load} className="btn-luxe mt-3 px-4 py-2 text-xs">Try again</button>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>
        ) : !error && snaps.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">No posts waiting for review.</p>
        ) : (
          snaps.map((snap) => (
            <div key={snap.id} className="card-luxe p-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="shrink-0">
                  {snap.url ? (
                    snap.mediaType === 'video' ? (
                      <video
                        src={snap.url}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-44 w-full rounded-xl bg-black object-contain sm:w-44"
                      />
                    ) : (
                      <img
                        src={snap.url}
                        alt={snap.caption ?? 'Snap awaiting review'}
                        className="h-44 w-full rounded-xl object-cover sm:w-44"
                      />
                    )
                  ) : (
                    <div className="flex h-44 w-full items-center justify-center rounded-xl bg-cream text-xs text-neutral-400 sm:w-44">
                      Preview unavailable
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-charcoal">
                    <span className="truncate">{snap.providerName ?? 'Creator'}</span>
                    {snap.providerUsername && (
                      <span className="text-xs font-medium text-neutral-400">@{snap.providerUsername}</span>
                    )}
                    <span className="rounded-full bg-primary-muted px-2 py-0.5 text-[10px] font-bold text-primary">
                      {snap.collection}
                    </span>
                  </p>
                  {snap.caption && <p className="mt-1 text-sm text-neutral-600">{snap.caption}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Uploaded {formatUploaded(snap.createdAt)}
                    </span>
                    {snap.mediaType === 'video' && snap.durationSeconds != null && (
                      <span>Video, {formatDuration(snap.durationSeconds)}</span>
                    )}
                    {snap.mediaType === 'image' && <span>Photo</span>}
                  </p>

                  {rejectingId === snap.id ? (
                    <div className="mt-3 space-y-2">
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason for rejecting (saved with the snap)"
                        className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-primary"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => decide(snap, 'rejected')}
                          disabled={busyId === snap.id}
                          className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {busyId === snap.id ? 'Saving…' : 'Confirm reject'}
                        </button>
                        <button
                          onClick={() => { setRejectingId(null); setReason('') }}
                          disabled={busyId === snap.id}
                          className="rounded-full px-4 py-2 text-xs font-semibold text-neutral-500 ring-1 ring-neutral-200 hover:bg-neutral-50 disabled:opacity-50"
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => decide(snap, 'approved')}
                        disabled={busyId === snap.id}
                        className="btn-luxe px-4 py-2 text-xs disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3 w-3" /> {busyId === snap.id ? 'Saving…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => { setRejectingId(snap.id); setReason('') }}
                        disabled={busyId === snap.id}
                        className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-xs font-semibold text-red-500 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
                      >
                        <XCircle className="h-3 w-3" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
