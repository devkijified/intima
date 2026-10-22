import type { ReactNode } from 'react'

interface PageHeaderProps {
  /** Small burgundy context label above the title, where the page has one. */
  eyebrow?: string
  title: string
  /** Muted line under the title; may carry a HelpTip. */
  subtitle?: ReactNode
  /** Optional right-aligned control (e.g. a text action button). */
  action?: ReactNode
}

/**
 * The one page-header treatment for the logged-in pages, lifted from
 * the dashboard home: burgundy eyebrow, display-face title at the
 * house size, muted subtitle, hairline divider.
 */
export function PageHeader({ eyebrow, title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-200/70 pb-6">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-widest text-[#AC244D]">{eyebrow}</p>
        )}
        <h1 className="mt-1 font-display text-[34px] font-semibold leading-tight tracking-tight text-charcoal">
          {title}
        </h1>
        {subtitle && <div className="mt-1.5 text-sm leading-6 text-neutral-500">{subtitle}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
