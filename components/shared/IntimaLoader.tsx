import { cn } from '@/lib/utils/helpers'

/**
 * Intima's own loading indicator: three dots in burgundy and gold
 * rising in a slow wave. Pure CSS (keyframes live in app/globals.css);
 * prefers-reduced-motion swaps the wave for a gentle pulse. Use
 * anywhere a spinner used to go.
 */
const SIZES = {
  sm: { box: 'h-3 gap-[3px]', dot: 6 },
  md: { box: 'h-4 gap-1', dot: 8 },
  lg: { box: 'h-6 gap-1.5', dot: 12 },
} as const

export function IntimaLoader({
  size = 'md',
  className,
}: {
  size?: keyof typeof SIZES
  className?: string
}) {
  const s = SIZES[size]
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-flex items-center', s.box, className)}
    >
      <span className="sr-only">Loading</span>
      <span
        aria-hidden
        className="il-dot block rounded-full bg-primary"
        style={{ width: s.dot, height: s.dot }}
      />
      <span
        aria-hidden
        className="il-dot block rounded-full bg-[#C9A84C]"
        style={{ width: s.dot, height: s.dot, animationDelay: '0.15s' }}
      />
      <span
        aria-hidden
        className="il-dot block rounded-full bg-primary"
        style={{ width: s.dot, height: s.dot, animationDelay: '0.3s' }}
      />
    </span>
  )
}
