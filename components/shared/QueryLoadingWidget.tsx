'use client'

import { useEffect, useState } from 'react'
import { subscribeQueryLoading } from '@/lib/queryLoading'
import { IntimaLoader } from '@/components/shared/IntimaLoader'

/**
 * Global background-query pill: floats at the top centre of the app
 * (below the header, safe-area aware) while any Supabase request is
 * in flight. Fixed overlay only: it never blocks taps and never
 * shifts layout. Shows after a short delay so fast queries do not
 * flash it, and lingers about 200ms after the last query finishes
 * so back-to-back fetches read as one smooth load.
 */
export function QueryLoadingWidget() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | null = null
    let hideTimer: ReturnType<typeof setTimeout> | null = null
    const unsub = subscribeQueryLoading((count) => {
      if (count > 0) {
        if (hideTimer) {
          clearTimeout(hideTimer)
          hideTimer = null
        }
        if (!showTimer) {
          showTimer = setTimeout(() => {
            showTimer = null
            setVisible(true)
          }, 120)
        }
      } else {
        if (showTimer) {
          clearTimeout(showTimer)
          showTimer = null
        }
        if (!hideTimer) {
          hideTimer = setTimeout(() => {
            hideTimer = null
            setVisible(false)
          }, 200)
        }
      }
    })
    return () => {
      unsub()
      if (showTimer) clearTimeout(showTimer)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      aria-hidden
      className="animate-pop-in pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[90] -translate-x-1/2"
    >
      <div className="flex items-center gap-2.5 rounded-full bg-charcoal/95 py-2 pl-4 pr-5 shadow-2xl backdrop-blur-md">
        <IntimaLoader size="sm" />
        <span className="text-xs font-semibold text-white">Loading</span>
      </div>
    </div>
  )
}
