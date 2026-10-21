'use client';

import { groupServices, resolveServices } from '@/lib/services';
import { cn } from '@/lib/utils/helpers';

interface ServiceChipsProps {
  services: string[] | null | undefined;
  /**
   * Compact preview mode: show the first N chips flat, then a "+N more"
   * chip. Omit for the full grouped display.
   */
  previewLimit?: number;
  /** Muted line shown when nothing is listed. Omit to render nothing. */
  emptyLabel?: string;
  className?: string;
}

function Chip({
  label,
  tone = 'brand',
}: {
  label: string;
  tone?: 'brand' | 'muted' | 'custom';
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium',
        tone === 'brand'
          ? 'border border-[#AC244D]/20 bg-[#AC244D]/[0.07] text-[#8F1D40]'
          : tone === 'custom'
            ? 'border border-[#C9A84C]/60 bg-[#C9A84C]/[0.08] text-[#7C5E14]'
            : 'border border-neutral-200 bg-neutral-50 text-neutral-500',
      )}
    >
      {label}
    </span>
  );
}

/**
 * Service offerings as tasteful chips. Grouped by category in full mode
 * (a companion's own custom services land in a final "More services"
 * group, in gold); flat with an overflow count in preview mode. Unknown
 * non-custom values are dropped silently.
 */
export function ServiceChips({ services, previewLimit, emptyLabel, className }: ServiceChipsProps) {
  const resolved = resolveServices(services);

  if (resolved.length === 0) {
    if (!emptyLabel) return null;
    return <p className={cn('text-sm text-neutral-400', className)}>{emptyLabel}</p>;
  }

  if (previewLimit !== undefined && resolved.length > previewLimit) {
    const shown = resolved.slice(0, previewLimit);
    const rest = resolved.length - shown.length;
    return (
      <div className={cn('flex flex-wrap gap-1.5', className)}>
        {shown.map((s) => (
          <Chip key={s.id} label={s.label} tone={s.custom ? 'custom' : 'brand'} />
        ))}
        <Chip label={`+${rest} more`} tone="muted" />
      </div>
    );
  }

  if (previewLimit !== undefined) {
    return (
      <div className={cn('flex flex-wrap gap-1.5', className)}>
        {resolved.map((s) => (
          <Chip key={s.id} label={s.label} tone={s.custom ? 'custom' : 'brand'} />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      {groupServices(services).map(({ category, items }) => (
        <div key={category}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
            {category === 'Custom' ? 'More services' : category}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {items.map((s) => (
              <Chip key={s.id} label={s.label} tone={s.custom ? 'custom' : 'brand'} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
