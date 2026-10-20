'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, CheckCircle2, XCircle } from '@/lib/icons'

/**
 * Paystack callback: verifies the transaction and credits coins,
 * then shows the result.
 */
export default function CoinsCallbackPage() {
  const params = useSearchParams()
  const router = useRouter()
  const [state, setState] = useState<'verifying' | 'success' | 'failed'>('verifying')
  const [coins, setCoins] = useState(0)

  useEffect(() => {
    const reference = params.get('reference')
    if (!reference) {
      setState('failed')
      return
    }
    let live = true
    ;(async () => {
      try {
        const res = await fetch(`/api/coins/verify?reference=${encodeURIComponent(reference)}`)
        const data = await res.json()
        if (live) {
          if (data.success) {
            setCoins(data.coins ?? 0)
            setState('success')
          } else {
            setState('failed')
          }
        }
      } catch {
        if (live) setState('failed')
      }
    })()
    return () => { live = false }
  }, [params])

  return (
    <div className="mx-auto max-w-md px-4 py-16 pb-28 text-center md:pb-10">
      {state === 'verifying' && (
        <>
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-gold" />
          <h1 className="mt-4 font-display text-xl font-semibold text-charcoal">Confirming payment...</h1>
          <p className="mt-1 text-sm text-neutral-500">Crediting your coins.</p>
        </>
      )}
      {state === 'success' && (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">
            +{coins.toLocaleString()} coins
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Payment successful. Go send some gifts.</p>
          <div className="mt-6 flex gap-3">
            <Link href="/live" className="flex-1 rounded-full bg-primary py-3 text-sm font-bold text-white">
              Watch live
            </Link>
            <Link href="/coins" className="flex-1 rounded-full border border-neutral-200 py-3 text-sm font-semibold text-charcoal">
              Wallet
            </Link>
          </div>
        </>
      )}
      {state === 'failed' && (
        <>
          <XCircle className="mx-auto h-12 w-12 text-red-400" />
          <h1 className="mt-4 font-display text-xl font-semibold text-charcoal">Payment didn't go through</h1>
          <p className="mt-1 text-sm text-neutral-500">No coins were added. You can try again.</p>
          <Link href="/coins" className="mt-6 block rounded-full bg-charcoal py-3 text-sm font-bold text-white">
            Back to coins
          </Link>
        </>
      )}
    </div>
  )
}
