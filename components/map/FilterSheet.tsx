'use client';

import { X } from '@/lib/icons';
import { SERVICE_CATALOG, type ServiceCategory } from '@/lib/services';
import { cn } from '@/lib/utils/helpers';
import type { Filters } from './IntimaMap';

interface FilterSheetProps {
  open: boolean;
  filters: Filters;
  onChange: (filters: Filters) => void;
  resultCount: number;
  onClose: () => void;
}

/** Budget bands filter pins by the short-time rate. */
const BUDGET_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'Any', value: null },
  { label: '≤ ₦50k', value: 50000 },
  { label: '≤ ₦100k', value: 100000 },
  { label: '≤ ₦200k', value: 200000 },
];

const CATEGORY_ORDER: ServiceCategory[] = ['Calls', 'Dates', 'Experiences'];

/**
 * Familiar bottom-sheet filters (the Jiji/Airbnb pattern): budget bands
 * plus multi-select services grouped by category, with a live result
 * count on the confirm button. Keeps the map chrome to a single row.
 */
export function FilterSheet({ open, filters, onChange, resultCount, onClose }: FilterSheetProps) {
  if (!open) return null;

  const toggleService = (id: string) =>
    onChange({
      ...filters,
      services: filters.services.includes(id)
        ? filters.services.filter((s) => s !== id)
        : [...filters.services, id],
    });

  const clearAll = () =>
    onChange({ ...filters, budget: null, services: [] });

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: SERVICE_CATALOG.filter((s) => s.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <div
        className="animate-fade-in absolute inset-0 z-30 bg-black/45"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="animate-sheet-up absolute inset-x-0 bottom-0 z-40">
        <div className="mx-auto max-w-md px-3 pb-3 sm:px-6 sm:pb-6">
          <div className="overflow-hidden rounded-[28px] bg-cream shadow-2xl">
            <div className="flex justify-center pt-2.5">
              <div className="h-1 w-10 rounded-full bg-neutral-300" />
            </div>

            <div className="flex items-center justify-between px-5 pb-1 pt-2">
              <h2 className="font-display text-xl font-semibold tracking-tight text-charcoal">
                Filters
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearAll}
                  className="rounded-full px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-muted"
                >
                  Clear all
                </button>
                <button
                  onClick={onClose}
                  aria-label="Close filters"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-black/5 text-charcoal transition-colors hover:bg-black/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[58dvh] overflow-y-auto px-5 pb-4">
              {/* Budget */}
              <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                Budget, short time
              </p>
              <div className="flex flex-wrap gap-2">
                {BUDGET_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => onChange({ ...filters, budget: opt.value })}
                    aria-pressed={filters.budget === opt.value}
                    className={cn(
                      'rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-95',
                      filters.budget === opt.value
                        ? 'bg-charcoal text-white shadow-md'
                        : 'bg-white text-charcoal ring-1 ring-black/10 hover:ring-black/20',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Services, grouped by category. AND logic: she must offer everything selected. */}
              <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                Services offered
              </p>
              <div className="space-y-4">
                {grouped.map(({ category, items }) => (
                  <div key={category}>
                    <p className="mb-1.5 text-xs font-semibold text-neutral-500">{category}</p>
                    <div className="flex flex-wrap gap-2">
                      {items.map((s) => {
                        const active = filters.services.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => toggleService(s.id)}
                            aria-pressed={active}
                            className={cn(
                              'rounded-full px-3.5 py-2 text-sm font-medium transition-all active:scale-95',
                              active
                                ? 'bg-primary text-white shadow-md shadow-primary/25'
                                : 'bg-white text-charcoal ring-1 ring-black/10 hover:ring-black/20',
                            )}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-neutral-400">
                Selecting more than one service shows only providers who offer all of them.
              </p>
            </div>

            <div className="border-t border-black/[0.06] bg-cream/95 p-4 backdrop-blur">
              <button
                onClick={onClose}
                className="w-full rounded-2xl bg-primary py-3.5 text-base font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary-dark active:scale-[0.99]"
              >
                Show {resultCount} {resultCount === 1 ? 'result' : 'results'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
