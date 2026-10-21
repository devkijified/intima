import { cn } from '@/lib/utils/helpers'

/**
 * Intima's own loading indicator: the rose, drawn in black and
 * white while colour fills it from the base up, holds, then drains
 * and starts again. (Redeploy marker: production had stayed on the
 * previous build after the rose commit landed.) Two stacked copies of the same artwork: a grey
 * one underneath, and the burgundy and gold one on top revealed by
 * an animated clip (keyframes live in app/globals.css).
 * prefers-reduced-motion rests the rose at full colour.
 */

const BUD =
  'M24 6c9.4 0 17 7.6 17 17.2 0 5.2-2.3 9.6-5.7 12.7-3 2.7-7.3 4.3-11.6 3.9-4.6-.4-8.7-1.9-11.8-5C9.3 32.7 7 28.3 7 23.2 7 13.6 14.6 6 24 6Z'
const PETAL_TOP_LEFT = 'M9.5 20C12 12.5 17.5 8.5 24 8.2'
const PETAL_TOP_RIGHT = 'M38.5 20C36 12.5 30.5 8.5 24 8.2'
const PETAL_IN_LEFT = 'M13 27.5c1.8-6.5 6-10.3 11-11.4'
const PETAL_IN_RIGHT = 'M35 27.5c-1.8-6.5-6-10.3-11-11.4'
const SWIRL =
  'M24 17.5c4.7 0 8.5 3.8 8.5 8.5s-3.8 8.5-8.5 8.5-8.5-3.8-8.5-8.5c0-4 3.2-7.2 7.2-7.2 3.3 0 6 2.7 6 6 0 2.7-2.2 4.8-4.8 4.8-2.1 0-3.8-1.7-3.8-3.8'

function RoseArt({ tone }: { tone: 'grey' | 'colour' }) {
  const c =
    tone === 'grey'
      ? { fill: '#E7E5E4', stroke: '#57534E', line: '#A8A29E', swirl: '#78716C', stem: '#D6D3D1' }
      : { fill: '#AC244D', stroke: '#7F1D3A', line: '#E59AB2', swirl: '#C9A84C', stem: '#C9A84C' }
  return (
    <svg viewBox="0 0 48 48" className="block h-full w-full" aria-hidden>
      <rect x="18" y="39.5" width="12" height="5" rx="2.5" fill={c.stem} />
      <path d={BUD} fill={c.fill} stroke={c.stroke} strokeWidth="2" strokeLinejoin="round" />
      <path d={PETAL_TOP_LEFT} fill="none" stroke={c.line} strokeWidth="1.8" strokeLinecap="round" />
      <path d={PETAL_TOP_RIGHT} fill="none" stroke={c.line} strokeWidth="1.8" strokeLinecap="round" />
      <path d={PETAL_IN_LEFT} fill="none" stroke={c.line} strokeWidth="1.6" strokeLinecap="round" />
      <path d={PETAL_IN_RIGHT} fill="none" stroke={c.line} strokeWidth="1.6" strokeLinecap="round" />
      <path d={SWIRL} fill="none" stroke={c.swirl} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

const SIZES = { sm: 22, md: 30, lg: 42 } as const

export function IntimaLoader({
  size = 'md',
  className,
}: {
  size?: keyof typeof SIZES
  className?: string
}) {
  const px = SIZES[size]
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('relative inline-block shrink-0', className)}
      style={{ width: px, height: px }}
    >
      <span className="sr-only">Loading</span>
      <span aria-hidden className="absolute inset-0">
        <RoseArt tone="grey" />
      </span>
      <span aria-hidden className="il-rose-color absolute inset-0">
        <RoseArt tone="colour" />
      </span>
    </span>
  )
}
