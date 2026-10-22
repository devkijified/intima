import type { ComponentType, ReactNode } from 'react'

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>
  title: string
  /** One line of guidance under the title, in the page's existing words. */
  guidance?: ReactNode
  /** Optional call to action, rendered under the guidance. */
  children?: ReactNode
}

/**
 * The one empty-state treatment for the logged-in pages: a house
 * card, a centred icon disc in the burgundy tint, a display-face
 * title and one line of guidance.
 */
export function EmptyState({ icon: Icon, title, guidance, children }: EmptyStateProps) {
  return (
    <div className="card-luxe p-10 text-center sm:p-12">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-muted">
        <Icon className="h-7 w-7 text-[#AC244D]" />
      </div>
      <h2 className="font-display text-xl font-semibold tracking-tight text-charcoal">{title}</h2>
      {guidance && (
        <div className="mx-auto mt-2 max-w-sm text-sm leading-6 text-neutral-500">{guidance}</div>
      )}
      {children}
    </div>
  )
}
