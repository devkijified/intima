'use client';

import { useEffect, useState } from 'react';
import { X, Share, PlusSquare } from 'lucide-react';

/**
 * PWA install prompt. Android Chrome fires `beforeinstallprompt`,
 * which we catch and surface as a native-feeling banner. iOS has no
 * prompt event, so we show manual "Add to Home Screen" instructions.
 * Dismissed state persists in localStorage.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [showIos, setShowIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (localStorage.getItem('intima_pwa_dismissed') === '1') return;
    // Already installed? Stay quiet.
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
      setDismissed(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS: no prompt event. Show instructions once after a beat.
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isIos && isSafari) {
      const t = setTimeout(() => setShowIos(true), 4000);
      return () => {
        window.removeEventListener('beforeinstallprompt', onPrompt);
        clearTimeout(t);
      };
    }
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    localStorage.setItem('intima_pwa_dismissed', '1');
    setDismissed(true);
    setShowIos(false);
    setDeferred(null);
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    dismiss();
  };

  if (dismissed && !showIos) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[70] md:bottom-6 md:left-auto md:right-6 md:w-96">
      <div className="rounded-3xl border border-white/10 bg-charcoal p-4 text-white shadow-2xl">
        <div className="flex items-start gap-3">
          <img src="/icons/icon.svg" alt="" className="h-12 w-12 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Install Intima</p>
            {showIos ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-white/70">
                Tap <Share className="h-3.5 w-3.5" /> Share, then{' '}
                <PlusSquare className="h-3.5 w-3.5" /> Add to Home Screen
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-white/70">
                Add to your home screen for the full app experience.
              </p>
            )}
          </div>
          <button onClick={dismiss} aria-label="Dismiss" className="rounded-full p-1 text-white/60">
            <X className="h-4 w-4" />
          </button>
        </div>
        {!showIos && (
          <button
            onClick={install}
            className="mt-3 w-full rounded-full bg-primary py-2.5 text-sm font-bold text-white active:scale-[0.98]"
          >
            Install app
          </button>
        )}
      </div>
    </div>
  );
}
