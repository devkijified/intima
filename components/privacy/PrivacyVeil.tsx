'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Screenshot deterrents, web grade, and an honest ceiling: browsers
 * give web apps no way to hard-block screenshots the way native
 * apps do (WhatsApp uses Android's FLAG_SECURE; Prime Video uses
 * DRM). Even WhatsApp Web cannot block a screenshot. What the web
 * CAN do, and what this does:
 *
 * 1. App-switcher cover: the moment the app loses visibility or
 *    focus, a branded cover replaces the screen, so the recent-apps
 *    preview and casual recordings of a backgrounded app show the
 *    cover, not her photos or your chats. (The cover arms on a short
 *    delay after window blur so native pickers and checkout iframes
 *    do not flash it; visibility loss covers instantly.)
 * 2. Protected media (anything wrapped in data-protect): long-press
 *    save callouts are off (CSS), images cannot be dragged out, and
 *    the right-click / long-press context menu is suppressed.
 * 3. Every protected photo already carries the watermark (site and
 *    her username), so a screenshot that does happen names its
 *    source.
 */
export function PrivacyVeil() {
  const [covered, setCovered] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const coverNow = () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
      setCovered(true);
    };
    const uncover = () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
      setCovered(false);
    };
    const onVis = () => {
      if (document.hidden) coverNow();
      else uncover();
    };
    const onBlur = () => {
      blurTimer.current = setTimeout(() => setCovered(true), 350);
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', uncover);

    const inProtected = (e: Event) =>
      (e.target as HTMLElement | null)?.closest?.('[data-protect]');
    const onContextMenu = (e: Event) => {
      if (inProtected(e)) e.preventDefault();
    };
    const onDragStart = (e: Event) => {
      if (inProtected(e)) e.preventDefault();
    };
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('dragstart', onDragStart);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', uncover);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('dragstart', onDragStart);
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  if (!covered) return null;
  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-[#111118]">
      <span className="font-display text-3xl font-semibold text-white">
        Intima<span className="text-gold">.</span>
      </span>
      <span className="mt-2 text-xs font-medium text-white/50">Content protected</span>
    </div>
  );
}
