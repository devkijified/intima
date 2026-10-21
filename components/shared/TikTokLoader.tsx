import { cn } from '@/lib/utils/helpers'

/**
 * TikTok-style loading dots: a teal and a pink dot chasing and
 * swapping places around each other. Pure CSS (keyframes live in
 * app/globals.css); prefers-reduced-motion swaps the chase for a
 * gentle pulse. Use anywhere a spinner used to go.
 */
const SIZES = {
  sm: { box: 'h-3 w-8', dot: 9, travel: 14 },
  md: { box: 'h-4 w-11', dot: 12, travel: 19 },
  lg: { box: 'h-6 w-16', dot: 17, travel: 28 },
} as const

export function TikTokLoader({
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
      className={cn('relative inline-flex items-center justify-between', s.box, className)}
      style={{ ['--tt-travel' as string]: `${s.travel}px` }}
    >
      <span className="sr-only">Loading</span>
      <span
        aria-hidden
        className="tt-dot-a block rounded-full bg-[#25F4EE]"
        style={{ width: s.dot, height: s.dot }}
      />
      <span
        aria-hidden
        className="tt-dot-b block rounded-full bg-[#FE2C55]"
        style={{ width: s.dot, height: s.dot }}
      />
    </span>
  )
}
