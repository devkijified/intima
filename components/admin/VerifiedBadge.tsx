import { BadgeCheck } from '@/lib/icons'

/**
 * The one verified mark in admin: the same burgundy check seal
 * (BadgeCheck) the app shows publicly on map pins and companion
 * profiles, never a different shield drawn per page. In admin it
 * always carries the word "Verified" next to it, so the meaning is
 * never icon-only.
 */
export function VerifiedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 align-middle text-xs font-semibold text-primary ${className}`}
    >
      <BadgeCheck aria-hidden className="h-4 w-4 shrink-0 text-primary" />
      Verified
    </span>
  )
}
