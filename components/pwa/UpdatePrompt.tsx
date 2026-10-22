'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from '@/lib/icons';
import { claimPrompt, releasePrompt, onPromptFree } from '@/lib/promptGate';

/**
 * "New version ready" prompt, the MamaShop pattern, with a grace
 * limit (product rule, 2026-10-22): a waiting update may be
 * dismissed 5 times across sessions; after the fifth dismissal the
 * prompt turns into a gate with no way past it but Reload.
 *
 * The service worker no longer activates itself mid-session. When a
 * newer worker finishes installing and an older one still controls
 * the page, this card offers a one-tap reload: it tells the waiting
 * worker to take over and reloads when control changes. Without it,
 * installed apps keep running the old build until every tab closes,
 * which on phones can be days.
 *
 * Dismissals are counted in localStorage (intima_update_skips) and
 * the count resets once the app is actually current again: after an
 * update check finds no waiting or installing worker, the running
 * build is the latest, so past skips are forgiven.
 */
const SKIP_KEY = 'intima_update_skips';
const MAX_SKIPS = 5;

function readSkips(): number {
  try {
    const n = parseInt(localStorage.getItem(SKIP_KEY) ?? '0', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [visible, setVisible] = useState(false);
  const [gateOk, setGateOk] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [skips, setSkips] = useState(0);
  const reloadingRef = useRef(false);
  const forced = skips >= MAX_SKIPS;

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let reg: ServiceWorkerRegistration | undefined;

    const offer = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const count = readSkips();
      setSkips(count);
      // Forced updates ignore the per-session dismissal: the grace
      // is spent, so the gate comes back in the same session too.
      if (count < MAX_SKIPS && sessionStorage.getItem('intima_update_dismissed') === '1') return;
      setWaiting(worker);
      setVisible(true);
    };

    const onControllerChange = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const check = async () => {
      if (!reg) return;
      try {
        await reg.update();
        // Nothing waiting and nothing installing after a check:
        // this page already runs the latest build, so forgive any
        // skips counted against an update that has since landed.
        if (!reg.waiting && !reg.installing) {
          try { localStorage.removeItem(SKIP_KEY); } catch { /* private mode */ }
          setSkips(0);
        }
      } catch { /* offline or deregistered */ }
    };

    navigator.serviceWorker
      .getRegistration()
      .then((r) => {
        if (!r) return;
        reg = r;
        if (r.waiting && navigator.serviceWorker.controller) offer(r.waiting);
        r.addEventListener('updatefound', () => {
          const installing = r.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              offer(installing);
            }
          });
        });
        void check();
      })
      .catch(() => {});

    const interval = setInterval(check, 60 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // One prompt at a time (lib/promptGate): wait while the install
  // pop or the push card is showing instead of stacking.
  useEffect(() => {
    if (!visible) return;
    if (claimPrompt('update')) {
      setGateOk(true);
      return () => releasePrompt('update');
    }
    setGateOk(false);
    const off = onPromptFree(() => {
      if (claimPrompt('update')) setGateOk(true);
    });
    return off;
  }, [visible]);

  const dismiss = () => {
    const next = readSkips() + 1;
    try { localStorage.setItem(SKIP_KEY, String(next)); } catch { /* private mode */ }
    setSkips(next);
    sessionStorage.setItem('intima_update_dismissed', '1');
    releasePrompt('update');
    setVisible(false);
  };

  const reload = () => {
    if (!waiting) return;
    setReloading(true);
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // If control never changes (edge case), do not trap the user.
    setTimeout(() => window.location.reload(), 4000);
  };

  if (!visible || !waiting || !gateOk) return null;

  if (forced) {
    return (
      <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/60 p-4 sm:items-center">
        <div className="w-full max-w-sm rounded-3xl bg-charcoal p-5 text-white shadow-2xl">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary">
              <RefreshCw aria-hidden className={`h-5 w-5 ${reloading ? 'animate-spin' : ''}`} />
            </span>
            <p className="text-sm font-bold">Intima needs this update now</p>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-white/70">
            This update has been skipped {MAX_SKIPS} times, so it can no longer be put off. Reload to continue on the latest version. Your account and chats are untouched.
          </p>
          <button
            onClick={reload}
            disabled={reloading}
            className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary px-4 py-3 text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-60"
          >
            {reloading ? 'Reloading' : 'Reload now'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[95] sm:left-auto sm:right-6 sm:w-96">
      <div className="flex items-center gap-3 rounded-3xl bg-charcoal p-4 text-white shadow-2xl">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary">
          <RefreshCw aria-hidden className={`h-5 w-5 ${reloading ? 'animate-spin' : ''}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">A new version of Intima is ready</p>
          <p className="text-xs text-white/70">
            Reload to get the latest fixes and features.
            {skips > 0 ? ` Skipped ${skips} of ${MAX_SKIPS} times.` : ''}
          </p>
        </div>
        <button
          onClick={reload}
          disabled={reloading}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-60"
        >
          {reloading ? 'Reloading' : 'Reload'}
        </button>
        <button
          onClick={dismiss}
          aria-label="Later"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:text-white"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
