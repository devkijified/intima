'use client';

import { useEffect, useState } from 'react';
import { X, Share, PlusSquare } from '@/lib/icons';

/**
 * Install pop, modelled on the download card people already
 * understand from viral Nigerian web apps: big friendly sheet, the
 * app icon up top, and plain numbered steps for the phones that
 * cannot install in one tap.
 *
 * Android Chrome gets the native one-tap prompt when the browser
 * offers it, and falls back to menu steps when it does not. iOS
 * Safari always needs the manual Share route, so the steps say
 * exactly which buttons to press, in order, with the real icons.
 *
 * Dismissing snoozes for 3 days instead of vanishing forever: one
 * accidental tap used to silence the old banner for good, and the
 * whole point of the pop is that people find it when they are
 * ready. Installed apps (standalone mode or the appinstalled event)
 * never see it.
 */

const SNOOZE_KEY = 'intima_pwa_snooze_until';
const INSTALLED_KEY = 'intima_pwa_installed';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

type Mode = 'native' | 'ios' | 'android-manual';

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-muted text-xs font-bold text-primary">
        {n}
      </span>
      <span className="text-sm leading-relaxed text-neutral-600">{children}</span>
    </li>
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((navigator as any).standalone) return;
    if (localStorage.getItem(INSTALLED_KEY) === '1') return;
    const snoozeUntil = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    if (snoozeUntil > Date.now()) return;

    let promptSeen = false;
    let manualTimer: ReturnType<typeof setTimeout> | undefined;
    const showTimer = setTimeout(() => setOpen(true), 5000);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      promptSeen = true;
      setDeferred(e);
      setMode('native');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const onInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, '1');
      setOpen(false);
    };
    window.addEventListener('appinstalled', onInstalled);

    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
    const isAndroid = /android/i.test(ua);
    if (isIos && isSafari) {
      setMode('ios');
    } else if (isAndroid) {
      // If the browser never offers the native prompt, teach the
      // menu route rather than leaving the pop empty.
      manualTimer = setTimeout(() => {
        if (!promptSeen) setMode((m) => m ?? 'android-manual');
      }, 8000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(showTimer);
      if (manualTimer) clearTimeout(manualTimer);
    };
  }, []);

  const later = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    setOpen(false);
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') {
      localStorage.setItem(INSTALLED_KEY, '1');
      setOpen(false);
    } else {
      later();
    }
  };

  if (!open || !mode) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
      <button
        aria-label="Close"
        onClick={later}
        className="absolute inset-0 h-full w-full cursor-default bg-black/50"
      />
      <div className="relative w-full max-w-md rounded-t-[28px] bg-white p-6 pb-[max(2rem,env(safe-area-inset-bottom))] text-charcoal shadow-2xl sm:rounded-[28px]">
        <button
          onClick={later}
          aria-label="Not now"
          className="absolute right-4 top-4 rounded-full p-2 text-neutral-400 transition-colors hover:text-charcoal"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <img
            src="/icons/icon-192.png"
            alt=""
            className="h-[72px] w-[72px] rounded-[20px] shadow-lg"
          />
          <h2 className="mt-4 font-display text-2xl font-semibold">Get the Intima app</h2>
          <p className="mt-1 text-sm text-neutral-500">Where Elegance Meets Connection</p>
        </div>

        {mode === 'native' && (
          <>
            <p className="mt-4 text-center text-sm leading-relaxed text-neutral-600">
              Install Intima on your home screen. It opens faster, fills the
              whole screen, and notifications reach you the moment a message
              lands or a stream goes live.
            </p>
            <button
              onClick={install}
              className="btn-luxe mt-5 flex h-12 w-full items-center justify-center text-[15px]"
            >
              Install app
            </button>
          </>
        )}

        {mode === 'ios' && (
          <>
            <p className="mt-4 text-center text-sm text-neutral-600">
              Installing takes ten seconds, right from Safari:
            </p>
            <ol className="mt-4 space-y-3 text-left">
              <Step n={1}>
                Tap the <Share className="inline h-4 w-4 align-[-2px] text-primary" />{' '}
                <strong className="font-semibold text-charcoal">Share</strong> button at
                the bottom of Safari.
              </Step>
              <Step n={2}>
                Scroll down and tap{' '}
                <PlusSquare className="inline h-4 w-4 align-[-2px] text-primary" />{' '}
                <strong className="font-semibold text-charcoal">Add to Home Screen</strong>.
              </Step>
              <Step n={3}>
                Tap <strong className="font-semibold text-charcoal">Add</strong> at the top
                corner, then open Intima from your home screen.
              </Step>
            </ol>
          </>
        )}

        {mode === 'android-manual' && (
          <>
            <p className="mt-4 text-center text-sm text-neutral-600">
              Installing takes ten seconds, right from Chrome:
            </p>
            <ol className="mt-4 space-y-3 text-left">
              <Step n={1}>
                Tap the <strong className="font-semibold text-charcoal">three dots</strong>{' '}
                at the top corner of Chrome.
              </Step>
              <Step n={2}>
                Tap <strong className="font-semibold text-charcoal">Install app</strong>.
                Some phones call it{' '}
                <strong className="font-semibold text-charcoal">Add to Home screen</strong>.
              </Step>
              <Step n={3}>
                Tap <strong className="font-semibold text-charcoal">Install</strong>, then
                open Intima from your home screen.
              </Step>
            </ol>
          </>
        )}

        <button
          onClick={later}
          className="mt-5 w-full py-2 text-center text-sm font-medium text-neutral-400 transition-colors hover:text-charcoal"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
