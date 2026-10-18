'use client'

import { useEffect, useState } from 'react'
import { X, ShieldCheck, Phone, Video, MessageCircle, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getConnectionFeeNgn } from '@/lib/settings/platformSettings'
import { getPaymentProvider, newPaymentReference } from '@/lib/payments/provider'
import { formatPrice, getInitials } from '@/lib/utils/helpers'

interface RequestConnectionModalProps {
  providerId: string
  providerName: string
  providerAvatarUrl?: string | null
  onClose: () => void
  onConnected: () => void
}

type Step = 'summary' | 'processing' | 'success' | 'error'

export function RequestConnectionModal({
  providerId,
  providerName,
  providerAvatarUrl,
  onClose,
  onConnected,
}: RequestConnectionModalProps) {
  const [fee, setFee] = useState<number | null>(null)
  const [step, setStep] = useState<Step>('summary')
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false
    getConnectionFeeNgn().then((value) => {
      if (!cancelled) setFee(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handlePay() {
    if (fee === null) return
    setStep('processing')
    setError('')

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Please sign in to request a connection.')
      }

      const provider = getPaymentProvider()
      const reference = newPaymentReference()
      const init = await provider.initialize(fee, reference, {
        client_id: user.id,
        provider_id: providerId,
        kind: 'connection_fee',
      })
      const status = await provider.verify(init.reference)
      if (status !== 'paid') {
        throw new Error('Payment was not completed. Please try again.')
      }

      const { error: insertError } = await supabase.from('connections').insert({
        client_id: user.id,
        provider_id: providerId,
        fee_ngn: fee,
        status: 'active',
        payment_ref: init.reference,
      })
      if (insertError) throw insertError

      setStep('success')
      onConnected()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStep('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        e.stopPropagation()
        if (step !== 'processing') onClose()
      }}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-xl font-bold text-charcoal">Request connection</h2>
          <button
            onClick={onClose}
            disabled={step === 'processing'}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {step === 'summary' && (
          <>
            <div className="flex items-center gap-4 mb-5">
              {providerAvatarUrl ? (
                <img
                  src={providerAvatarUrl}
                  alt={providerName}
                  className="w-16 h-16 rounded-full object-cover border-2 border-primary/20"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary-muted flex items-center justify-center text-primary font-bold text-xl">
                  {getInitials(providerName)}
                </div>
              )}
              <div>
                <p className="font-semibold text-charcoal">{providerName}</p>
                <p className="text-sm text-gray-500">Verified provider</p>
              </div>
            </div>

            <div className="bg-cream rounded-2xl p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-600">Connection fee</span>
                <span className="text-2xl font-bold text-primary">
                  {fee === null ? '...' : formatPrice(fee)}
                </span>
              </div>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <MessageCircle className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                  <span>Unlocks in-platform chat with {providerName}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Phone className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                  <span>Unlocks voice and video calls</span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                  <span>She keeps 100% of her own rates. This fee is the only platform charge.</span>
                </li>
              </ul>
            </div>

            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-5">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-800">
                Test mode: no real money moves. The live payment rail plugs in here after legal review.
              </p>
            </div>

            <button
              onClick={handlePay}
              disabled={fee === null}
              className="w-full bg-primary hover:bg-primary-dark text-white font-medium py-3.5 rounded-2xl transition-colors disabled:opacity-50"
            >
              {fee === null ? 'Loading fee...' : `Pay ${formatPrice(fee)} (Test mode)`}
            </button>
            <p className="text-xs text-gray-400 text-center mt-3">
              One active connection per provider. Refunds follow the published policy.
            </p>
          </>
        )}

        {step === 'processing' && (
          <div className="py-10 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-gray-600">Processing your connection (test mode)...</p>
          </div>
        )}

        {step === 'success' && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="w-14 h-14 text-green-600" />
            <h3 className="text-lg font-bold text-charcoal">You are connected</h3>
            <p className="text-sm text-gray-600 max-w-xs">
              You can now chat and call {providerName} directly from her profile. No middleman, no extra cuts.
            </p>
            <div className="flex gap-2 w-full mt-2">
              <button
                onClick={onClose}
                className="flex-1 bg-primary hover:bg-primary-dark text-white font-medium py-3 rounded-2xl transition-colors flex items-center justify-center gap-2"
              >
                <Video className="w-4 h-4" />
                Start a call
              </button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500" />
            <h3 className="text-lg font-bold text-charcoal">Payment did not go through</h3>
            <p className="text-sm text-gray-600">{error}</p>
            <div className="flex gap-3 w-full mt-2">
              <button
                onClick={() => setStep('summary')}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-3 rounded-2xl hover:bg-gray-50 transition-colors"
              >
                Try again
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-gray-100 text-gray-600 font-medium py-3 rounded-2xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
