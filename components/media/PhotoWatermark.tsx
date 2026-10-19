'use client';

import { cn } from '@/lib/utils/helpers';

/**
 * Subtle brand watermark overlaid on provider photos (Tryst-style):
 * small lowercase wordmark, bottom-right, barely there but always there.
 * Anti-scraping and brand presence in one.
 */
export function PhotoWatermark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute bottom-2 right-2 select-none text-[10px] font-semibold lowercase tracking-[0.22em] text-white/75',
        className,
      )}
      style={{ textShadow: '0 1px 6px rgba(0,0,0,0.65)' }}
    >
      intima
    </span>
  );
}
