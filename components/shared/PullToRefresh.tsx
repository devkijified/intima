'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePullToRefresh } from '@/lib/hooks/usePullToRefresh'
import { TikTokLoader } from '@/components/shared/TikTokLoader'
import { cn } from '@/lib/utils/helpers'

/**
 * Wraps a list or feed surface with pull to refresh. The indicator
 * is the shared TikTok dots in a small pill that slides in over the
 * top of the surface (safe-area aware) as you pull; the content
 * itself never moves, so nothing shifts layout. Wire onRefresh to
 * the surface's real refetch function.
 */
export function PullToRefresh({
  onRefresh,
  children,
  className,
  disabled,
}: {
  onRefresh: () => Promise<void> | void
  children: ReactNode
  className?: string
  disabled?: boolean
}) {
  const { ref, pull, refreshing, dragging, threshold } = usePullToRefresh(onRefresh, { disabled })
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const progress = refreshing ? 1 : Math.min(1, pull / threshold)
  // Reduced motion: no travel, the pill simply fades in at the top.
  const travel = reducedMotion ? 52 : refreshing ? 52 : progress * 52

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div
        aria-hidden={!refreshing}
        className="pointer-events-none absolute inset-x-0 z-30 flex justify-center"
        style={{
          top: 'max(0.25rem, env(safe-area-inset-top))',
          transform: `translateY(${travel - 52}px)`,
          opacity: refreshing ? 1 : progress,
          transition: dragging ? 'none' : 'transform 260ms ease, opacity 260ms ease',
        }}
      >
        <div className="flex h-10 items-center rounded-full bg-white px-4 shadow-lg ring-1 ring-black/5">
          <TikTokLoader size="sm" />
        </div>
      </div>
      {children}
    </div>
  )
}
