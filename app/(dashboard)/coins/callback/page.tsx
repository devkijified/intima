'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, CheckCircle2, XCircle } from '@/lib/icons'

type Phase = 'verifying' | 'waiting' | 'success' | 'failed'

const POLL_MS = 4000
const MAX_POLLS = 30

/**
 * Paystack callback: verifies the transaction and credits coins,
 * then shows the result. Bank transfers settle minutes after the
 * buyer returns, so a pending answer polls with a waiting state
 * instead of failing; the webhook settles the credit even if this
 * page is closed before the transfer confirms.
 */
export default function CoinsCallbackPage() {
  const params = useSearchParams()
  const [phase, setPhase] = useState<Phase>('verifying')
  const [coins, setCoins] = useState(0)
  const [stillWaiting, setStillWaiting] = useState(false)
  // Set when the buyer topped up from inside a live room's gift
  // panel: offer the way back, and the room reopens the panel on
  // the gift they had selected.
  const [liveReturn, setLiveReturn] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('intima_gift_return')
      if (!raw) return
      const stash = JSON.parse(raw) as { sessionId?: string }
      if (stash.sessionId) setLiveReturn(stash.sessionId)
    } catch {
      /* storage unavailable */
    }
  }, [])

  useEffect(() => {
    const reference = params.get('reference')
    if (!reference) {
      setPhase('failed')
      return
    }
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const poll = async () => {
      attempts += 1
      try {
        const res = await fetch(`/api/coins/verify?reference=${encodeURIComponent(reference)}`)
        const data = await res.json().catch(() => ({}))
        if (!live) return
        if (data.success) {
          setCoins(data.coins ?? 0)
          setPhase('success')
          return
        }
        if (data.pending) {
          setPhase('waiting')
          if (attempts < MAX_POLLS) {
            timer = setTimeout(poll, POLL_MS)
          } else {
            setStillWaiting(true)
          }
          return
        }
        setPhase('failed')
      } catch {
        if (!live) return
        if (attempts < MAX_POLLS) {
          timer = setTimeout(poll, POLL_MS)
        } else {
          setPhase('failed')
        }
      }
    }
    poll()
    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
  }, [params])

  return (
    <div className="mx-auto max-w-md px-4 py-16 pb-28 text-center md:pb-10">
      {phase === 'verifying' && (
        <>
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-gold" />
          <h1 className="mt-4 font-display text-xl font-semibold text-charcoal">Confirming payment...</h1>
          <p className="mt-1 text-sm text-neutral-500">Crediting your coins.</p>
        </>
      )}
      {phase === 'waiting' && (
        <>
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-gold" />
          <h1 className="mt-4 font-display text-xl font-semibold text-charcoal">Waiting for your transfer to confirm</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {stillWaiting
              ? 'This is taking longer than usual. Your coins land automatically once your bank confirms the transfer, even if you leave this page.'
              : 'If you have sent the transfer, your coins land automatically once your bank confirms it, usually a few minutes. You can close this page, the credit will still arrive.'}
          </p>
          <Link href="/coins" className="mt-6 flex min-h-[44px] items-center justify-center rounded-full bg-charcoal py-3 text-sm font-bold text-white">
            Back to wallet
          </Link>
          {liveReturn && (
            <Link href={`/live/${liveReturn}`} className="mt-3 flex min-h-[44px] items-center justify-center rounded-full bg-primary py-3 text-sm font-bold text-white">
              Back to the live room
            </Link>
          )}
        </>
      )}
      {phase === 'success' && (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">
            {coins > 0 ? `+${coins.toLocaleString()} coins` : 'Coins added'}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Payment successful. Go send some gifts.</p>
          {liveReturn ? (
            <Link href={`/live/${liveReturn}`} className="mt-6 flex min-h-[44px] items-center justify-center rounded-full bg-primary py-3 text-sm font-bold text-white">
              Back to the live room
            </Link>
          ) : null}
          <div className="mt-6 flex gap-3">
            <Link href="/live" className="flex-1 inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary py-3 text-sm font-bold text-white">
              Watch live
            </Link>
            <Link href="/coins" className="flex-1 inline-flex min-h-[44px] items-center justify-center rounded-full border border-neutral-200 py-3 text-sm font-semibold text-charcoal">
              Wallet
            </Link>
          </div>
        </>
      )}
      {phase === 'failed' && (
        <>
          <XCircle className="mx-auto h-12 w-12 text-red-400" />
          <h1 className="mt-4 font-display text-xl font-semibold text-charcoal">Payment didn't go through</h1>
          <p className="mt-1 text-sm text-neutral-500">No coins were added. You can try again.</p>
          <Link href="/coins" className="mt-6 flex min-h-[44px] items-center justify-center rounded-full bg-charcoal py-3 text-sm font-bold text-white">
            Back to coins
          </Link>
        </>
      )}
    </div>
  )
}
