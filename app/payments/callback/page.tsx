'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, CheckCircle2, XCircle } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'

/**
 * Paystack return page for the connection fee: verify the payment,
 * create the connection through the gated API, then land the client
 * on the companion's page, connected.
 */
export default function PaymentsCallbackPage() {
  const params = useSearchParams()
  const router = useRouter()
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working')
  const [message, setMessage] = useState('Confirming your payment…')

  useEffect(() => {
    const reference = params.get('ref') ?? params.get('reference')
    if (!reference) {
      setState('failed')
      setMessage('No payment reference came back. If you were charged, contact support and we will sort it.')
      return
    }
    let live = true
    ;(async () => {
      try {
        const v = await fetch(`/api/payments/paystack/verify?reference=${encodeURIComponent(reference)}`)
          .then((r) => r.json())
          .catch(() => null)
        if (!live) return
        if (!v?.paid || !v.targetProviderId) {
          setState('failed')
          setMessage('The payment did not confirm. You have not been connected.')
          return
        }
        setMessage('Payment confirmed. Opening your connection…')
        const res = await fetch('/api/connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider_id: v.targetProviderId, payment_ref: reference }),
        })
        const data = await res.json().catch(() => null)
        if (!live) return
        if (!res.ok && !data?.alreadyConnected) {
          setState('failed')
          setMessage(data?.error ?? 'Payment confirmed, but the connection could not be opened. Contact support with your reference and we will fix it.')
          return
        }
        const supabase = createClient()
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', v.targetProviderId)
          .maybeSingle()
        setState('done')
        setMessage('You are connected. Say hello when you are ready.')
        const slug = profile?.username ?? v.targetProviderId
        setTimeout(() => router.push(`/companion/${slug}`), 1200)
      } catch {
        if (live) {
          setState('failed')
          setMessage('Something went wrong confirming the payment. If you were charged, contact support.')
        }
      }
    })()
    return () => { live = false }
  }, [params, router])

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      {state === 'working' && (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">One moment</h1>
          <p className="mt-1 text-sm text-neutral-500">{message}</p>
        </>
      )}
      {state === 'done' && (
        <>
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">Connected</h1>
          <p className="mt-1 text-sm text-neutral-500">{message}</p>
        </>
      )}
      {state === 'failed' && (
        <>
          <XCircle className="h-12 w-12 text-red-400" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">Payment not completed</h1>
          <p className="mt-1 text-sm leading-relaxed text-neutral-500">{message}</p>
          <Link href="/" className="btn-luxe mt-6 px-6 py-3 text-sm">Back to the map</Link>
        </>
      )}
    </div>
  )
}
