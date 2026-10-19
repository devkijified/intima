'use client';

import { formatCompactPrice } from '@/lib/utils/helpers';

export interface RateCardRates {
  shortTime: number | null;
  overnight: number | null;
  weekend: number | null;
}

const RATE_LABELS: Array<{ key: keyof RateCardRates; label: string }> = [
  { key: 'shortTime', label: 'Short time' },
  { key: 'overnight', label: 'Overnight' },
  { key: 'weekend', label: 'Weekend' },
];

/**
 * Rates are shown BEFORE the connection fee CTA, so nobody pays the fee
 * blind and then discovers the rate is out of reach. When a provider has
 * not listed rates yet, the section says so instead of hiding.
 */
export function RateCard({ rates }: { rates: RateCardRates }) {
  const listed = RATE_LABELS.filter(({ key }) => rates[key] !== null);

  return (
    <div className="rounded-2xl bg-cream p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Rates
      </p>
      {listed.length === 0 ? (
        <p className="mt-1 text-sm text-neutral-400">Rates not listed yet</p>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-1.5 sm:gap-2">
          {listed.map(({ key, label }) => (
            <div
              key={key}
              className="min-w-0 rounded-xl bg-white px-1.5 py-2 text-center ring-1 ring-black/5 sm:px-2"
            >
              <p className="truncate text-[10px] text-neutral-500 sm:text-[11px]">{label}</p>
              <p className="mt-0.5 text-[13px] font-bold text-charcoal sm:text-sm">
                {formatCompactPrice(rates[key] as number)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
