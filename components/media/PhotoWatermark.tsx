'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils/helpers';
import { watermarkText } from '@/lib/site';

/**
 * Content watermark in the Fansly pattern: the site's own link
 * with the creator's username joined to it (host/username),
 * overlaid on companion media so screenshots and reposts carry
 * where the content lives. The host is parsed from the runtime
 * origin (see lib/site), so a domain change renames every
 * watermark at once.
 *
 * variant "edge": one straight horizontal line across the lower
 * bottom centre, for full media views (Fans Only lightbox,
 * stories, gallery lightbox). It used to run vertically down the
 * left edge; the owner asked for a straight watermark at the
 * middle or lower bottom instead.
 * variant "corner": a small line at the bottom right, for thumbs
 * and cards. The parent must be positioned (relative).
 */
export function PhotoWatermark({
  username,
  variant = 'corner',
  className,
}: {
  username?: string | null;
  variant?: 'edge' | 'corner';
  className?: string;
}) {
  const [text, setText] = useState(() => watermarkText(username));
  useEffect(() => {
    setText(watermarkText(username));
  }, [username]);

  if (variant === 'edge') {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-[13%] z-10 select-none text-center text-xs font-semibold lowercase tracking-[0.22em] text-white/60',
          className,
        )}
        style={{ textShadow: '0 1px 8px rgba(0,0,0,0.7)' }}
      >
        {text}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute bottom-2 right-2 z-10 select-none text-[10px] font-semibold lowercase tracking-[0.14em] text-white/75',
        className,
      )}
      style={{ textShadow: '0 1px 6px rgba(0,0,0,0.65)' }}
    >
      {text}
    </span>
  );
}
