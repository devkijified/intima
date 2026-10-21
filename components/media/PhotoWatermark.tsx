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
 * variant "edge": a vertical line down the left edge, for full
 * media views (Fans Only lightbox, stories, gallery lightbox).
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
          'pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 rotate-180 select-none whitespace-nowrap text-[11px] font-semibold lowercase tracking-[0.18em] text-white/70 [writing-mode:vertical-rl]',
          className,
        )}
        style={{ textShadow: '0 1px 6px rgba(0,0,0,0.65)' }}
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
