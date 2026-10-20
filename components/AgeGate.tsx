'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck } from '@/lib/icons'
import { AgeVerificationModal } from './AgeVerificationModal'

const COOKIE_NAME = 'intima_age_ok'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

function hasAgeCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split('; ').some((part) => part.startsWith(`${COOKIE_NAME}=1`))
}

/**
 * Hard 18+ gate. Blocks the whole app behind age verification until the
 * visitor confirms, then persists the choice in a 1 year cookie.
 * Rendered at the top of the root layout so no route renders first.
 */
export function AgeGate({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    setVerified(hasAgeCookie())
    setChecked(true)
  }, [])

  function handleVerify() {
    document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
    setVerified(true)
  }

  if (!checked) {
    return null
  }

  if (!verified) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <ShieldCheck className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-charcoal">Intima</h1>
        <p className="text-gray-500 mt-1 mb-6">Where Elegance Meets Connection</p>
        <AgeVerificationModal isOpen onClose={() => {}} onVerify={handleVerify} />
      </div>
    )
  }

  return <>{children}</>
}
