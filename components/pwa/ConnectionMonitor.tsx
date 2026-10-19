'use client';

import { useEffect, useRef, useState } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

/**
 * Connection monitor. `navigator.onLine` alone lies (it only checks for a
 * network interface), so we verify with a lightweight heartbeat fetch.
 * Shows a banner when offline, a "back online" toast when restored, and
 * auto-reloads data-driven pages on reconnect.
 */
export function ConnectionMonitor() {
  const [online, setOnline] = useState(true);
  const [showRestored, setShowRestored] = useState(false);
  const wasOffline = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;

    const heartbeat = async (): Promise<boolean> => {
      // Fast lie-detector: navigator.onLine is wrong often enough to check.
      if (!navigator.onLine) return false;
      try {
        const res = await fetch('/manifest.webmanifest', {
          method: 'HEAD',
          cache: 'no-store',
        });
        return res.ok;
      } catch {
        return false;
      }
    };

    const check = async () => {
      const up = await heartbeat();
      if (!live) return;
      setOnline((prev) => {
        if (prev && !up) {
          wasOffline.current = true;
        }
        if (!prev && up && wasOffline.current) {
          wasOffline.current = false;
          setShowRestored(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            if (live) setShowRestored(false);
          }, 4000);
        }
        return up;
      });
      // Re-check every 15s; the online/offline events catch fast changes.
      timer.current = setTimeout(() => {
        if (live) check();
      }, 15000);
    };

    const onBrowserOnline = () => check();
    const onBrowserOffline = () => {
      if (!live) return;
      wasOffline.current = true;
      setOnline(false);
    };

    window.addEventListener('online', onBrowserOnline);
    window.addEventListener('offline', onBrowserOffline);
    check();

    return () => {
      live = false;
      window.removeEventListener('online', onBrowserOnline);
      window.removeEventListener('offline', onBrowserOffline);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (online && !showRestored) return null;

  return (
    <>
      {!online && (
        <div className="fixed left-0 right-0 top-0 z-[80] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
          <WifiOff className="h-4 w-4" />
          No internet connection. Waiting to reconnect...
        </div>
      )}
      {online && showRestored && (
        <div className="fixed left-1/2 top-4 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xl">
          <Wifi className="h-4 w-4" />
          Back online
          <button
            onClick={() => window.location.reload()}
            className="ml-1 flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      )}
    </>
  );
}
