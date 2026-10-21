'use client'

import { useEffect, useState } from 'react'
import { subscribeQueryLoading } from '@/lib/queryLoading'
import { IntimaLoader } from '@/components/shared/IntimaLoader'

/**
 * Global loading pill: the rose loader at the CENTRE of the screen,
 * where design systems put a screen-level indicator (a centred
 * indicator says "this screen is working"; an indicator floating at
 * the top reads as stray chrome and collides with headers and the
 * live room's host row). Pointer-events stay off and layout never
 * shifts. It shows only after a sustained wait (350ms) so ordinary
 * background queries never flash it, and lingers about 200ms after
 * the last query finishes so back-to-back fetches read as one load.
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
          }, 350)
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
      className="animate-pop-in pointer-events-none fixed inset-0 z-[94] flex items-center justify-center"
    >
      <div className="flex items-center gap-2.5 rounded-full bg-charcoal/95 py-2 pl-4 pr-5 shadow-2xl backdrop-blur-md">
        <IntimaLoader size="sm" />
        <span className="text-xs font-semibold text-white">Loading</span>
      </div>
    </div>
  )
}
