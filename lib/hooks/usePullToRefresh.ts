'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Pull to refresh, touch only. Arms only when every scrollable
 * ancestor (and the window) is at the very top, follows the finger
 * with resistance, and past the threshold runs the surface's real
 * refetch. The indicator is an overlay, so page content never moves
 * and layout never shifts. No-op for mouse input and when disabled.
 * Honours prefers-reduced-motion: the gesture still works, the
 * indicator simply fades in instead of travelling.
 */
export function usePullToRefresh(
  onRefresh: () => Promise<void> | void,
  opts?: { threshold?: number; disabled?: boolean }
) {
  const threshold = opts?.threshold ?? 70
  const ref = useRef<HTMLDivElement>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const stateRef = useRef({ startY: 0, armed: false, pull: 0, refreshing: false })
  const refreshRef = useRef(onRefresh)
  refreshRef.current = onRefresh
  const disabledRef = useRef(!!opts?.disabled)
  disabledRef.current = !!opts?.disabled

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const st = stateRef.current

    const atTop = () => {
      if (window.scrollY > 0) return false
      let node: HTMLElement | null = el
      while (node && node !== document.body) {
        if (node.scrollTop > 0) return false
        node = node.parentElement
      }
      return true
    }

    const onTouchStart = (e: TouchEvent) => {
      if (disabledRef.current || st.refreshing) return
      if (e.touches.length !== 1) return
      st.armed = atTop()
      st.startY = e.touches[0].clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!st.armed || st.refreshing || disabledRef.current) return
      const dy = e.touches[0].clientY - st.startY
      if (dy <= 0) {
        if (st.pull !== 0) {
          st.pull = 0
          setPull(0)
        }
        return
      }
      // Resistance: the indicator travels slower than the finger.
      const dist = Math.min(dy * 0.45, threshold + 30)
      st.pull = dist
      setPull(dist)
      setDragging(true)
      if (dist > 6) e.preventDefault()
    }

    const endGesture = async () => {
      const wasArmed = st.armed
      st.armed = false
      setDragging(false)
      if (!wasArmed || st.refreshing) return
      if (st.pull >= threshold) {
        st.refreshing = true
        setRefreshing(true)
        const started = Date.now()
        try {
          await refreshRef.current()
        } catch {
          // A failed refetch still ends the gesture cleanly; the
          // surface keeps whatever data it already had.
        }
        // Keep the indicator up briefly so fast refetches do not flicker.
        const wait = Math.max(0, 600 - (Date.now() - started))
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
        st.refreshing = false
        setRefreshing(false)
      }
      st.pull = 0
      setPull(0)
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', endGesture)
    el.addEventListener('touchcancel', endGesture)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', endGesture)
      el.removeEventListener('touchcancel', endGesture)
    }
  }, [threshold])

  return { ref, pull, refreshing, dragging, threshold }
}
