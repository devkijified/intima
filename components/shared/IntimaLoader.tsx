import { cn } from '@/lib/utils/helpers'

/**
 * Intima's own loading indicator: the rose, drawn in black and
 * white while colour fills it from the base up, holds, then drains
 * and starts again. The artwork is the rose toy itself: a smooth
 * bud body, the petal rings on top spiralling into the centre
 * opening, and the little power button on the body. Two stacked copies of the same artwork: a grey
 * one underneath, and the burgundy and gold one on top revealed by
 * an animated clip (keyframes live in app/globals.css).
 * prefers-reduced-motion rests the rose at full colour.
 * (Build marker: v2, request board UI release.)
 */

const BODY =
  'M24 9c8 0 14.5 6.3 14.5 15.2 0 9.8-6.3 16.8-14.5 16.8S9.5 33.8 9.5 24.2C9.5 15.3 16 9 24 9Z'
const RING_OUTER =
  'M13.8 15.5c0-3.8 4.6-6.8 10.2-6.8s10.2 3 10.2 6.8-4.6 6.8-10.2 6.8-10.2-3-10.2-6.8Z'
const RING_MIDDLE =
  'M17.2 15.5c0-2.4 3-4.4 6.8-4.4s6.8 2 6.8 4.4-3 4.4-6.8 4.4-6.8-2-6.8-4.4Z'
const PETAL_LEFT = 'M16.2 11.6c1.5 1.2 2.3 2.8 2.4 4.8'
const PETAL_RIGHT = 'M31.8 11.6c-1.5 1.2-2.3 2.8-2.4 4.8'

function RoseArt({ tone }: { tone: 'grey' | 'colour' }) {
  const c =
    tone === 'grey'
      ? { fill: '#E7E5E4', stroke: '#57534E', ring: '#DCD8D4', line: '#A8A29E', hole: '#404040', btn: '#78716C' }
      : { fill: '#AC244D', stroke: '#7F1D3A', ring: '#9C1F43', line: '#E59AB2', hole: '#2A0813', btn: '#C9A84C' }
  return (
    <svg viewBox="0 0 48 48" className="block h-full w-full" aria-hidden>
      <path d={BODY} fill={c.fill} stroke={c.stroke} strokeWidth="2" strokeLinejoin="round" />
      <path d={RING_OUTER} fill={c.ring} stroke={c.line} strokeWidth="1.7" />
      <path d={RING_MIDDLE} fill={c.fill} stroke={c.line} strokeWidth="1.5" />
      <path d={PETAL_LEFT} fill="none" stroke={c.line} strokeWidth="1.4" strokeLinecap="round" />
      <path d={PETAL_RIGHT} fill="none" stroke={c.line} strokeWidth="1.4" strokeLinecap="round" />
      <ellipse cx="24" cy="15.5" rx="3.1" ry="2.3" fill={c.hole} />
      <circle cx="24" cy="33.5" r="2.3" fill="none" stroke={c.btn} strokeWidth="1.5" />
      <path d="M24 32.3v2.4" stroke={c.btn} strokeWidth="1.5" strokeLinecap="round" />
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
