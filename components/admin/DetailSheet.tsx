'use client'

import { useEffect } from 'react'
import { X } from '@/lib/icons'

/**
 * Slide-over detail panel for admin entity cards (users,
 * companions). Opens from the right, full width on small phones,
 * and sits below the confirm dialog layer (z-[95]) so a confirm
 * raised from inside the panel still lands on top. Closes on the
 * backdrop, the close button, or Escape.
 */
export function DetailSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />
      <div
        className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <h2 className="min-w-0 truncate font-display text-lg font-semibold tracking-tight text-charcoal">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-cream hover:text-charcoal"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  )
}
