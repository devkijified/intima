'use client'

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Info } from '@/lib/icons'
import { cn } from '@/lib/utils/helpers'

type TooltipSide = 'top' | 'bottom' | 'right'
type TooltipAlign = 'center' | 'start' | 'end'

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/** Hover opens the tip only where a real hover exists (mouse). */
function hoverCapable(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  )
}

/**
 * One tooltip for the whole app. On desktop (a real mouse), hover
 * and keyboard focus open it. On touch, a tap toggles it and a tap
 * anywhere else, a scroll, or Escape dismisses it.
 *
 * Positioning: the pill is placed with fixed coordinates measured
 * from the trigger when it opens, clamped to the viewport with an
 * 8px margin on every side, and flipped below the trigger when
 * there is no room above. It can never render off the edge of a
 * phone screen, which the old centred CSS positioning did whenever
 * the trigger sat near a side. The pill matches the global toast:
 * dark charcoal, white text, soft shadow.
 */
export function Tooltip({
  label,
  children,
  side = 'top',
  align = 'center',
  wrapperClassName,
}: {
  label: string
  children: ReactNode
  side?: TooltipSide
  align?: TooltipAlign
  wrapperClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const tipId = useId()

  // Measure and clamp once the pill has rendered (it renders
  // invisible for one frame so it can be measured).
  useIsoLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const wrap = wrapRef.current
    const tip = tipRef.current
    if (!wrap || !tip) return
    const t = wrap.getBoundingClientRect()
    const p = tip.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const M = 8
    let left: number
    let top: number
    if (side === 'right') {
      left = t.right + M
      if (left + p.width > vw - M) left = t.left - p.width - M
      top = t.top + t.height / 2 - p.height / 2
    } else {
      left =
        align === 'start'
          ? t.left
          : align === 'end'
            ? t.right - p.width
            : t.left + t.width / 2 - p.width / 2
      top = side === 'bottom' ? t.bottom + M : t.top - p.height - M
      if (side === 'top' && top < M) top = t.bottom + M
    }
    left = Math.min(Math.max(left, M), Math.max(M, vw - p.width - M))
    top = Math.min(Math.max(top, M), Math.max(M, vh - p.height - M))
    setPos({ top, left })
  }, [open, side, align])

  // Tap elsewhere, scroll, resize, and Escape dismiss.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onMove = () => setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open ])

  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement, {
        'aria-describedby': open ? tipId : undefined,
      } as Record<string, string | undefined>)
    : children

  return (
    <span
      ref={wrapRef}
      className={cn('relative inline-flex', wrapperClassName)}
      onMouseEnter={() => {
        if (hoverCapable()) setOpen(true)
      }}
      onMouseLeave={() => {
        if (hoverCapable()) setOpen(false)
      }}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)
      }}
      onClick={() => {
        // Touch and pen toggle here; a mouse uses hover, and a
        // mouse click must not fight it (the old double toggle is
        // why taps on phones opened and instantly closed the tip).
        if (!hoverCapable()) setOpen((v) => !v)
      }}
    >
      {trigger}
      {open && (
        <span
          ref={tipRef}
          role="tooltip"
          id={tipId}
          style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
          className={cn(
            'animate-pop-in pointer-events-none fixed z-[90] w-max max-w-[min(240px,75vw)] rounded-2xl bg-charcoal/95 px-3 py-2 text-center text-xs leading-snug text-white shadow-2xl backdrop-blur-md',
            !pos && 'left-0 top-0'
          )}
        >
          {label}
        </span>
      )}
    </span>
  )
}

/**
 * The help icon: a small info button that opens the shared tooltip
 * with a plain-language explanation. The visible glyph stays small,
 * but the hit area is padded out to a full 44px touch target via the
 * wrapper (padding added, then pulled back with negative margin so
 * layouts do not shift).
 */
export function HelpTip({
  text,
  label = 'More information',
  side = 'top',
  align = 'center',
  className,
}: {
  text: string
  label?: string
  side?: TooltipSide
  align?: TooltipAlign
  className?: string
}) {
  return (
    <Tooltip label={text} side={side} align={align} wrapperClassName="-m-2.5 p-2.5">
      <button
        type="button"
        aria-label={label}
        className={cn(
          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:text-primary focus-visible:text-primary',
          className
        )}
      >
        <Info className="h-[18px] w-[18px]" />
      </button>
    </Tooltip>
  )
}
