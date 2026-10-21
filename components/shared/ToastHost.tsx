'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { subscribeToast, takeStashedToast } from '@/lib/toast'

// Renders the global toast. Mounted once in the root layout, so it
// survives in-app navigation: a message raised on one page is still
// visible after the app redirects to login or signup. A message
// stashed before a full page reload is picked up on mount and on
// every route change while it is still fresh.
export function ToastHost() {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathname = usePathname()

  const show = (message: string, id: number, ms: number) => {
    setToast({ id, message })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setToast(null), ms)
  }

  useEffect(() => {
    const unsub = subscribeToast((t) => {
      if (t) show(t.message, t.id, 3600)
    })
    return () => {
      unsub()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const stashed = takeStashedToast()
    if (stashed) show(stashed, -1, 4200)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  if (!toast) return null
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[97] flex justify-center px-4"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="rounded-full bg-charcoal/95 px-5 py-2.5 text-center text-sm text-white shadow-2xl backdrop-blur-md">
        {toast.message}
      </div>
    </div>
  )
}
