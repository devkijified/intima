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
 * shifts.
 *
 * Two guards keep it engineered rather than noisy:
 * 1. It shows only after a sustained wait (350ms), so ordinary
 *    background queries never flash it.
 * 2. It defers to page-level loaders: while any element marked
 *    data-page-loader is on screen (a page rendering its own
 *    centred rose), the pill stays hidden, so the two never stack.
 * It lingers about 200ms after the last query finishes so
 * back-to-back fetches read as one smooth load.
 */
export function QueryLoadingWidget() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let startedAt = 0
    let tick: ReturnType<typeof setInterval> | null = null
    let hideTimer: ReturnType<typeof setTimeout> | null = null

    const stopTick = () => {
      if (tick) {
        clearInterval(tick)
        tick = null
      }
    }

    const unsub = subscribeQueryLoading((count) => {
      if (count > 0) {
        if (hideTimer) {
          clearTimeout(hideTimer)
          hideTimer = null
        }
        if (!startedAt) startedAt = Date.now()
        if (!tick) {
          tick = setInterval(() => {
            const sustained = Date.now() - startedAt >= 350
            const pageLoaderUp = !!document.querySelector('[data-page-loader]')
            setVisible(sustained && !pageLoaderUp)
          }, 120)
        }
      } else {
        startedAt = 0
        stopTick()
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
      stopTick()
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
