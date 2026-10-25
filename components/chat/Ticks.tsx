'use client'

import { Clock, TickDouble, TickSingle } from '@/lib/icons'
import { cn } from '@/lib/utils/helpers'

/**
 * WhatsApp delivery ticks for your own messages: a clock while the
 * send is in flight, one tick when the server has it, two ticks
 * when it has landed on their device (delivered_at), two blue
 * ticks when they have read it (read_at). Colour follows the
 * surface: on your burgundy bubbles the unread ticks are white and
 * the read ticks go light blue; on light surfaces the unread ticks
 * are neutral grey and read goes WhatsApp blue.
 */
export type TickState = 'sending' | 'sent' | 'delivered' | 'read'

export function tickStateFor(m: {
  read_at?: string | null
  delivered_at?: string | null
}): Exclude<TickState, 'sending'> {
  if (m.read_at) return 'read'
  if (m.delivered_at) return 'delivered'
  return 'sent'
}

export default function Ticks({
  state,
  onColor = false,
  className,
}: {
  state: TickState
  /** True on a coloured (own) bubble, false on light surfaces. */
  onColor?: boolean
  className?: string
}) {
  if (state === 'sending') {
    return <Clock aria-hidden className={cn('h-3.5 w-3.5 shrink-0 opacity-70', className)} />
  }
  const tone =
    state === 'read'
      ? onColor
        ? 'text-sky-300'
        : 'text-[#53bdeb]'
      : onColor
        ? 'text-white/75'
        : 'text-neutral-400'
  return (
    <span className={cn('inline-flex shrink-0 items-center', tone, className)} aria-label={state}>
      {state === 'sent' ? (
        <TickSingle className="h-3.5 w-3.5" />
      ) : (
        <TickDouble className="h-3.5 w-[19px]" />
      )}
    </span>
  )
}
