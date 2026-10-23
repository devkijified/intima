'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { reencodeImage } from '@/lib/uploads/reencode'
import { ShieldCheck, ShieldAlert, Star, Clock, Camera, Loader2 } from '@/lib/icons'
import { HelpTip } from '@/components/ui/Tooltip'

interface DisputeEvent {
  id: string
  kind: string
  note: string | null
  evidence_path: string | null
  evidence_url: string | null
  actor_id: string | null
  created_at: string
}

function disputeKindLabel(ev: DisputeEvent): string {
  if (ev.kind === 'opened') return 'Dispute opened'
  if (ev.kind === 'evidence') return 'Evidence added'
  if (ev.kind === 'note') return 'Note'
  if (ev.kind === 'resolved') {
    return ev.note === 'refunded' ? 'Resolved: fee refunded' : 'Resolved: fee released'
  }
  if (ev.kind === 'auto_released') return 'Closed automatically: fee released'
  return ev.kind
}

interface ReviewState {
  canReview: boolean
  mine: { rating: number; comment: string | null; status: string } | null
  counterpartSubmitted: boolean
  counterpartReview: { rating: number; comment: string | null } | null
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function Stars({ value, onPick }: { value: number; onPick?: (n: number) => void }) {
  return (
    <div className="flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onPick}
          onClick={() => onPick?.(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          aria-pressed={onPick ? n <= value : undefined}
          className={`flex h-11 w-10 items-center justify-center ${onPick ? 'transition-transform active:scale-90' : ''}`}
        >
          <Star className={`h-6 w-6 ${n <= value ? 'text-gold' : 'text-neutral-300'}`} />
        </button>
      ))}
    </div>
  )
}

/** Small read-only stars for the slim one-line review rows. */
function StarsRow({ value }: { value: number }) {
  return (
    <span className="flex shrink-0 items-center gap-px" aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= value ? 'text-gold' : 'text-neutral-300'}`} />
      ))}
    </span>
  )
}

/**
 * Everything that protects a paid connection, in one strip inside the
 * chat thread:
 * 1. The 24 hour fee dispute window (Binance P2P style): while the fee
 *    is held, either side can open a dispute and an admin decides.
 * 2. Double-blind reviews: your review stays hidden until the other
 *    side writes theirs, or 72 hours pass. Then both go live.
 */
export default function ConnectionCare({
  connectionId,
  feeState,
  disputeDeadline,
  feeNgn,
  otherName,
  viewerIsClient,
}: {
  connectionId: string
  feeState: string | null
  disputeDeadline: string | null
  feeNgn: number | null
  otherName: string
  viewerIsClient: boolean
}) {
  const [fee, setFee] = useState(feeState)
  const [showDispute, setShowDispute] = useState(false)
  const [reason, setReason] = useState('')
  const [disputeBusy, setDisputeBusy] = useState(false)
  const [disputeError, setDisputeError] = useState('')

  const evidenceRef = useRef<HTMLInputElement>(null)
  const [disputeEvents, setDisputeEvents] = useState<DisputeEvent[]>([])
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [evidenceCaption, setEvidenceCaption] = useState('')
  const [evidenceBusy, setEvidenceBusy] = useState(false)
  const [evidenceError, setEvidenceError] = useState('')

  const [review, setReview] = useState<ReviewState | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState('')

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch(`/api/reviews?connection_id=${connectionId}`)
        if (!res.ok) return
        const data = (await res.json()) as ReviewState
        if (!live) return
        setReview(data)
        if (data.mine) {
          setRating(data.mine.rating)
          setComment(data.mine.comment ?? '')
        }
      } catch { /* the strip simply stays review-free */ }
    })()
    return () => { live = false }
  }, [connectionId])

  const windowOpen =
    fee === 'held' && disputeDeadline && new Date(disputeDeadline).getTime() > Date.now()

  async function openDispute() {
    setDisputeBusy(true)
    setDisputeError('')
    try {
      const res = await fetch('/api/connections/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId, reason }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not open the dispute')
      setFee('disputed')
      setShowDispute(false)
    } catch (e) {
      setDisputeError(e instanceof Error ? e.message : 'Could not open the dispute')
    }
    setDisputeBusy(false)
  }

  async function loadDisputeEvents() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setViewerId(user.id)
    const { data } = await supabase
      .from('dispute_events')
      .select('id, kind, note, evidence_path, actor_id, created_at')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: true })
    if (!data) return
    const rows = await Promise.all(
      (data as Omit<DisputeEvent, 'evidence_url'>[]).map(async (ev) => {
        let evidence_url: string | null = null
        if (ev.evidence_path) {
          const { data: signed } = await supabase.storage
            .from('dispute-evidence')
            .createSignedUrl(ev.evidence_path, 3600)
          evidence_url = signed?.signedUrl ?? null
        }
        return { ...ev, evidence_url }
      })
    )
    setDisputeEvents(rows)
  }

  useEffect(() => {
    if (fee !== 'disputed') return
    let live = true
    ;(async () => {
      try { if (live) await loadDisputeEvents() } catch { /* timeline simply stays empty */ }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fee, connectionId])

  async function pickEvidence(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setEvidenceError('Please choose an image file.'); return }
    if (file.size > 10 * 1024 * 1024) { setEvidenceError('That photo is too large. Please keep each photo under 10MB.'); return }
    setEvidenceBusy(true)
    setEvidenceError('')
    try {
      const supabase = createClient()
      let uid = viewerId
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser()
        uid = user?.id ?? null
        if (uid) setViewerId(uid)
      }
      if (!uid) throw new Error('Sign in required')
      // Re-encode first, same as every other upload surface: EXIF is
      // stripped and the image is capped at 1600px before it leaves
      // the phone.
      const blob = await reencodeImage(file)
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${uid}/${connectionId}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('dispute-evidence').upload(path, blob, {
        contentType: blob.type || file.type || 'image/jpeg',
        upsert: false,
      })
      if (upErr) throw upErr
      const res = await fetch('/api/connections/dispute-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId, path, note: evidenceCaption }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save the evidence')
      setEvidenceCaption('')
      await loadDisputeEvents()
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : 'Could not save the evidence')
    }
    setEvidenceBusy(false)
  }

  async function submitReview() {
    if (rating === 0) { setReviewError('Tap the stars to rate first.'); return }
    setReviewBusy(true)
    setReviewError('')
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId, rating, comment }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save your review')
      setReview((prev) => ({
        canReview: prev?.canReview ?? true,
        mine: data.mine ?? { rating, comment: comment || null, status: 'pending' },
        counterpartSubmitted: !!data.counterpartSubmitted,
        // The POST response carries the post-publish state; when both
        // reviews are in, the counterpart's review is revealed in it.
        // Keeping the stale local value here made the reveal look lost
        // until a page reload.
        counterpartReview: data.counterpartReview ?? prev?.counterpartReview ?? null,
      }))
      // Back to the slim row: the editor never sits open on the chat.
      setEditing(false)
      setReviewOpen(false)
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : 'Could not save your review')
    }
    setReviewBusy(false)
  }

  // Nothing to show (fee settled, no dispute, no review due):
  // render nothing at all, not even an empty bordered strip.
  const showStrip =
    (fee === 'held' && !!windowOpen) || fee === 'disputed' || !!(review && review.canReview)
  if (!showStrip) return null

  return (
    <div className="shrink-0 px-3 pt-2">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-1.5">
      {/* Fee protection: a WhatsApp-style system notice pill in
          the flow (pale, small, centered), never a white card.
          The explanation lives in the HelpTip; the dispute form
          opens as a card only when summoned. */}
      {fee === 'held' && windowOpen && !showDispute && (
        <div className="flex w-fit max-w-full items-center gap-1.5 rounded-lg bg-[#fdf3c6] px-2.5 py-1.5 shadow-sm">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          <p className="flex min-w-0 items-center gap-1 text-[11px] font-medium leading-snug text-neutral-600">
            <span className="truncate">
              {viewerIsClient ? 'Your' : 'The'}{feeNgn ? ` ₦${feeNgn.toLocaleString()}` : ''} fee is protected until {fmtDateTime(disputeDeadline)}
            </span>
            <HelpTip text="You have 24 hours from payment to open a dispute. Our team reviews both sides and decides on the connection fee only: it is either refunded to the client or released. The companion's own rate is never part of the dispute." />
          </p>
          <button onClick={() => setShowDispute(true)} className="shrink-0 py-1 text-[11px] font-bold text-primary">
            Dispute
          </button>
        </div>
      )}
      {fee === 'held' && windowOpen && showDispute && (
        <div className="w-full self-stretch rounded-2xl bg-white px-3.5 py-3 shadow-sm">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-charcoal">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            Open a dispute
          </p>
          <div className="mt-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Tell us what happened…"
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base outline-none focus:border-primary md:text-sm"
              />
              {disputeError && <p className="mt-1.5 text-xs text-red-600">{disputeError}</p>}
              <div className="mt-2 flex gap-2">
                <button onClick={openDispute} disabled={disputeBusy} className="btn-luxe min-h-[44px] px-5 py-2 text-xs disabled:opacity-50">
                  {disputeBusy ? 'Sending…' : 'Send dispute'}
                </button>
                <button onClick={() => setShowDispute(false)} className="btn-soft min-h-[44px] px-5 py-2 text-xs">Cancel</button>
              </div>
          </div>
        </div>
      )}

      {fee === 'disputed' && (
        <div className="flex w-full items-start gap-2.5 self-stretch rounded-2xl bg-amber-50 px-3 py-2.5 shadow-sm ring-1 ring-amber-100">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-charcoal">Dispute open on this connection</p>
            <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
              Our team is reviewing the fee. Chat stays open, and we will notify you both when it is decided.
            </p>

            {/* Evidence and timeline, visible to both parties. */}
            {disputeEvents.length > 0 && (
              <div className="mt-3 space-y-2.5 border-t border-amber-100 pt-2.5">
                {disputeEvents.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-charcoal">
                        {disputeKindLabel(ev)}
                        <span className="ml-1.5 font-normal text-neutral-400">{fmtDateTime(ev.created_at)}</span>
                      </p>
                      {ev.kind === 'opened' && ev.note && (
                        <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">{ev.note}</p>
                      )}
                      {ev.kind === 'evidence' && ev.note && (
                        <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">{ev.note}</p>
                      )}
                      {ev.kind === 'evidence' && ev.evidence_url && (
                        <a href={ev.evidence_url} target="_blank" rel="noreferrer">
                          <img src={ev.evidence_url} alt="Dispute evidence" className="mt-1.5 h-20 w-20 rounded-xl object-cover ring-1 ring-black/[0.06]" />
                        </a>
                      )}
                      {ev.kind === 'evidence' && !ev.evidence_url && ev.evidence_path && (
                        <p className="mt-0.5 text-[11px] text-neutral-400">Evidence photo added (preview unavailable).</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 border-t border-amber-100 pt-2.5">
              <p className="text-xs font-semibold text-charcoal">Add evidence</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">
                A screenshot or photo that helps the team decide. Both sides can add evidence.
              </p>
              <input
                value={evidenceCaption}
                onChange={(e) => setEvidenceCaption(e.target.value)}
                placeholder="Caption (optional)"
                maxLength={1000}
                className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base outline-none focus:border-primary md:text-sm"
              />
              {evidenceError && <p className="mt-1.5 text-xs text-red-600">{evidenceError}</p>}
              <input ref={evidenceRef} type="file" accept="image/*" className="hidden" onChange={pickEvidence} />
              <button
                type="button"
                onClick={() => evidenceRef.current?.click()}
                disabled={evidenceBusy}
                className="btn-soft mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-50"
              >
                {evidenceBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                {evidenceBusy ? 'Uploading…' : 'Add a photo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reviews: ONE slim row in the chat, always. The editor
          opens only on tap and closes back to the row on save, so
          a thread never opens on a review form again. */}
      {review && review.canReview && !review.mine && !reviewOpen && (
        <button
          onClick={() => setReviewOpen(true)}
          className="flex w-fit max-w-full items-center gap-2 rounded-lg bg-white/90 px-2.5 py-1.5 shadow-sm"
        >
          <span className="text-xs font-semibold text-charcoal">How was {otherName}?</span>
          <span className="text-xs font-bold text-primary">Write a review</span>
        </button>
      )}
      {review && review.canReview && !review.mine && reviewOpen && (
        <div className="w-full self-stretch rounded-2xl bg-white px-3.5 py-3 shadow-sm">
          <p className="text-[13px] font-semibold text-charcoal">How was {otherName}?</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
            <Clock className="h-3 w-3" />
            Reviews are double-blind: yours stays hidden until {otherName} reviews you too, or 3 days pass.
          </p>
          <div className="mt-2"><Stars value={rating} onPick={setRating} /></div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Say it plainly. No phone numbers or social handles; reviews go public."
            className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base outline-none focus:border-primary md:text-sm"
          />
          {reviewError && <p className="mt-1.5 text-xs text-red-600">{reviewError}</p>}
          <div className="mt-2 flex gap-2">
            <button onClick={submitReview} disabled={reviewBusy} className="btn-luxe min-h-[44px] px-5 py-2 text-xs disabled:opacity-50">
              {reviewBusy ? 'Saving…' : 'Submit review'}
            </button>
            <button onClick={() => setReviewOpen(false)} className="btn-soft min-h-[44px] px-5 py-2 text-xs">Cancel</button>
          </div>
        </div>
      )}
      {review && review.canReview && review.mine && !editing && (
        <>
          <button
            onClick={() => {
              if (review.mine!.status !== 'published' && !review.counterpartSubmitted) setEditing(true)
              else if (review.counterpartReview) setReviewOpen((v) => !v)
            }}
            className="flex w-fit max-w-full items-center gap-2 rounded-lg bg-white/90 px-2.5 py-1.5 shadow-sm"
          >
            <StarsRow value={review.mine.rating} />
            <span className="min-w-0 truncate text-xs font-semibold text-charcoal">
              {review.mine.status === 'published' ? 'Your review is live' : 'Your review is in'}
            </span>
            {review.mine.status !== 'published' && !review.counterpartSubmitted && (
              <span className="shrink-0 text-xs font-bold text-primary">Edit</span>
            )}
            {review.mine.status === 'published' && review.counterpartReview && (
              <span className="shrink-0 text-xs font-bold text-primary">{reviewOpen ? 'Hide theirs' : 'See theirs'}</span>
            )}
          </button>
          {review.mine.status === 'published' && reviewOpen && review.counterpartReview && (
            <div className="w-full self-stretch rounded-2xl bg-white px-3.5 py-3 shadow-sm">
              <p className="text-xs font-semibold text-neutral-500">{otherName} reviewed you</p>
              <div className="mt-1"><StarsRow value={review.counterpartReview.rating} /></div>
              {review.counterpartReview.comment && (
                <p className="mt-1 text-[13px] leading-relaxed text-neutral-600">{review.counterpartReview.comment}</p>
              )}
            </div>
          )}
        </>
      )}
      {review && review.canReview && review.mine && editing && (
        <div className="w-full self-stretch rounded-2xl bg-white px-3.5 py-3 shadow-sm">
          <p className="text-[13px] font-semibold text-charcoal">Your review</p>
          <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
            {review.counterpartSubmitted
              ? 'Both reviews are in; yours will appear any moment.'
              : `It stays hidden until ${otherName} reviews you, or 3 days pass. You can still edit it until then.`}
          </p>
          <div className="mt-1"><Stars value={rating} onPick={setRating} /></div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Say it plainly. No phone numbers or social handles; reviews go public."
            className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base outline-none focus:border-primary md:text-sm"
          />
          {reviewError && <p className="mt-1.5 text-xs text-red-600">{reviewError}</p>}
          <div className="mt-2 flex gap-2">
            <button onClick={submitReview} disabled={reviewBusy} className="btn-luxe min-h-[44px] px-5 py-2 text-xs disabled:opacity-50">
              {reviewBusy ? 'Saving…' : 'Update review'}
            </button>
            <button onClick={() => setEditing(false)} className="btn-soft min-h-[44px] px-5 py-2 text-xs">Cancel</button>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
