'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, Star, Clock } from '@/lib/icons'

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
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onPick}
          onClick={() => onPick?.(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={onPick ? 'transition-transform active:scale-90' : ''}
        >
          <Star className={`h-6 w-6 ${n <= value ? 'text-gold' : 'text-neutral-300'}`} />
        </button>
      ))}
    </div>
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

  const [review, setReview] = useState<ReviewState | null>(null)
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
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : 'Could not save your review')
    }
    setReviewBusy(false)
  }

  return (
    <div className="border-b border-black/[0.05] bg-white px-4 py-3">
      {/* Fee protection */}
      {fee === 'held' && windowOpen && (
        <div className="rounded-2xl bg-emerald-50/70 px-3.5 py-3 ring-1 ring-emerald-100">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-charcoal">
                {viewerIsClient ? 'Your' : 'The'} {feeNgn ? `₦${feeNgn.toLocaleString()} ` : ''}connection fee is protected until {fmtDateTime(disputeDeadline)}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
                If anything goes wrong, open a dispute and our team will review it. The fee stays frozen until they decide.
              </p>
              {!showDispute ? (
                <button onClick={() => setShowDispute(true)} className="mt-2 text-xs font-semibold text-primary">
                  Open a dispute
                </button>
              ) : (
                <div className="mt-2.5">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Tell us what happened…"
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {disputeError && <p className="mt-1.5 text-xs text-red-600">{disputeError}</p>}
                  <div className="mt-2 flex gap-2">
                    <button onClick={openDispute} disabled={disputeBusy} className="btn-luxe px-4 py-2 text-xs disabled:opacity-50">
                      {disputeBusy ? 'Sending…' : 'Send dispute'}
                    </button>
                    <button onClick={() => setShowDispute(false)} className="btn-soft px-4 py-2 text-xs">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {fee === 'disputed' && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50 px-3.5 py-3 ring-1 ring-amber-100">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-[13px] font-semibold text-charcoal">Dispute open on this connection</p>
            <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
              Our team is reviewing the fee. Chat stays open, and we will notify you both when it is decided.
            </p>
          </div>
        </div>
      )}

      {/* Reviews */}
      {review && review.canReview && (
        <div className="mt-3 rounded-2xl bg-cream/70 px-3.5 py-3 ring-1 ring-black/[0.04]">
          {!review.mine ? (
            <div>
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
                className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              />
              {reviewError && <p className="mt-1.5 text-xs text-red-600">{reviewError}</p>}
              <button onClick={submitReview} disabled={reviewBusy} className="btn-luxe mt-2 px-4 py-2 text-xs disabled:opacity-50">
                {reviewBusy ? 'Saving…' : 'Submit review'}
              </button>
            </div>
          ) : review.mine.status === 'published' ? (
            <div>
              <p className="text-[13px] font-semibold text-charcoal">Your review is live</p>
              <div className="mt-1"><Stars value={review.mine.rating} /></div>
              {review.counterpartReview ? (
                <div className="mt-2.5 border-t border-black/[0.05] pt-2.5">
                  <p className="text-xs font-semibold text-neutral-500">{otherName} reviewed you</p>
                  <div className="mt-1"><Stars value={review.counterpartReview.rating} /></div>
                  {review.counterpartReview.comment && (
                    <p className="mt-1 text-[13px] leading-relaxed text-neutral-600">{review.counterpartReview.comment}</p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-xs text-neutral-500">Their review of you has not landed yet.</p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-[13px] font-semibold text-charcoal">Your review is in</p>
              <div className="mt-1"><Stars value={review.mine.rating} /></div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                {review.counterpartSubmitted
                  ? 'Both reviews are in; yours will appear any moment.'
                  : `It stays hidden until ${otherName} reviews you, or 3 days pass. You can still edit it until then.`}
              </p>
              {!review.counterpartSubmitted && (
                <div className="mt-2">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {reviewError && <p className="mt-1.5 text-xs text-red-600">{reviewError}</p>}
                  <button onClick={submitReview} disabled={reviewBusy} className="btn-soft mt-1.5 px-4 py-2 text-xs disabled:opacity-50">
                    {reviewBusy ? 'Saving…' : 'Update review'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
