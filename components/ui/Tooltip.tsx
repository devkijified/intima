'use client'

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Info } from '@/lib/icons'
import { cn } from '@/lib/utils/helpers'

type TooltipSide = 'top' | 'bottom' | 'right'
type TooltipAlign = 'center' | 'start' | 'end'

/**
 * One tooltip for the whole app. Hover and keyboard focus open it on
 * desktop; on touch, a tap toggles it and a tap anywhere else (or
 * Escape) dismisses it. The pill matches the global toast: dark
 * charcoal, white text, soft shadow. The trigger keeps its own
 * behaviour: tapping still fires the wrapped control, and the child
 * element receives aria-describedby pointing at the tooltip while it
 * is open, so screen readers announce the same text.
 *
 * Positioning: the pill sits above the trigger by default (below
 * with side="bottom", for controls near the top of the screen) and
 * centres on it; align="start" or "end" pins it to the trigger's
 * edge so it stays on screen near the sides of the phone.
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
  const wrapRef = useRef<HTMLSpanElement>(null)
  const tipId = useId()

  // Tap elsewhere and Escape dismiss (the touch contract).
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
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
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
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)
      }}
      onClick={() => setOpen((v) => !v)}
    >
      {trigger}
      {open && (
        <span
          role="tooltip"
          id={tipId}
          className={cn(
            'animate-pop-in pointer-events-none absolute z-[90] w-max max-w-[min(240px,75vw)] rounded-2xl bg-charcoal/95 px-3 py-2 text-center text-xs leading-snug text-white shadow-2xl backdrop-blur-md',
            side === 'top' && 'bottom-full mb-2',
            side === 'bottom' && 'top-full mt-2',
            side === 'right' && 'left-full top-1/2 ml-2 -translate-y-1/2',
            side !== 'right' && align === 'center' && 'left-1/2 -translate-x-1/2',
            side !== 'right' && align === 'start' && 'left-0',
            side !== 'right' && align === 'end' && 'right-0'
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
