'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, X } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { pushState, subscribePush, iosNeedsInstall } from '@/lib/push-client'
import { claimPrompt, releasePrompt, onPromptFree } from '@/lib/promptGate'
import { IntimaLoader } from '@/components/shared/IntimaLoader'

const DONE_KEY = 'intima_push_auto'
const SNOOZE_KEY = 'intima_push_prompt_snooze_until'
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000

function markDone() {
  try {
    localStorage.setItem(DONE_KEY, 'done')
  } catch { /* silent */ }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS))
  } catch { /* silent */ }
}

// Push priming card, Apple-style: explain WHY in our own words first,
// and only fire the browser's permission prompt when the user taps
// Enable. Signed-in users only, on home surfaces; Maybe later snoozes
// for 3 days; a granted or denied system permission is final.
// iPhone browser tabs cannot receive push at all (Apple rule: Home
// Screen apps only), so on those the card teaches the install step
// first instead of offering an Enable button that could never work.
export default function PushAutoSubscribe() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [needsInstall, setNeedsInstall] = useState(false)
  const [busy, setBusy] = useState(false)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (!pathname) return
    const allowed =
      pathname === '/' ||
      pathname === '/dashboard' ||
      pathname.startsWith('/models/browse')
    if (!allowed) return
    try {
      if (localStorage.getItem(DONE_KEY) === 'done') return
      const until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0)
      if (until && Date.now() < until) return
    } catch {
      return
    }

    const installFirst = iosNeedsInstall()
    let cancelled = false
    let off: (() => void) | undefined
    const t = setTimeout(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getUser()
        if (!data.user || cancelled) return
        // One prompt at a time (lib/promptGate): if the install pop
        // or the update card is up, wait for the slot to free instead
        // of sliding in underneath another prompt.
        const ready = () => {
          if (cancelled) return
          if (claimPrompt('push')) {
            setVisible(true)
            return
          }
          off = onPromptFree(() => {
            if (!cancelled && claimPrompt('push')) setVisible(true)
          })
        }
        if (installFirst) {
          setNeedsInstall(true)
          ready()
          return
        }
        const state = await pushState()
        if (cancelled) return
        if (state === 'available') {
          ready()
        } else {
          // Subscribed, denied or unsupported: never show the card.
          markDone()
        }
      } catch { /* silent */ }
    }, 2500)
    return () => {
      cancelled = true
      clearTimeout(t)
      if (off) off()
    }
  }, [pathname])

  // Never hold the prompt slot after unmount.
  useEffect(() => () => releasePrompt('push'), [])

  if (!visible) return null

  const dismiss = () => {
    snooze()
    releasePrompt('push')
    setVisible(false)
  }

  const enable = async () => {
    setBusy(true)
    try {
      const res = await subscribePush()
      if (res.ok) {
        markDone()
        setEnabled(true)
        setTimeout(() => {
          releasePrompt('push')
          setVisible(false)
        }, 1800)
      } else if (res.reason === 'denied') {
        // The system prompt was answered No: respect it permanently.
        markDone()
        releasePrompt('push')
        setVisible(false)
      } else {
        snooze()
        releasePrompt('push')
        setVisible(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[85] sm:left-auto sm:right-6 sm:w-full sm:max-w-sm">
      <div className="relative rounded-3xl border border-black/[0.06] bg-white p-5 shadow-2xl">
        <button
          onClick={dismiss}
          aria-label="Maybe later"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 hover:text-charcoal"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Bell aria-hidden className="h-6 w-6 text-primary" />
        </div>
        {needsInstall ? (
          <>
            <h2 className="font-display text-lg font-semibold text-charcoal">
              Turn on notifications
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">
              On iPhone, notifications only work once Intima is on your
              Home Screen. It takes ten seconds:
            </p>
            <ol className="mt-3 space-y-2.5">
              {[
                'Tap the Share button at the bottom of Safari.',
                'Scroll down and tap Add to Home Screen.',
                'Open Intima from your home screen, and we will turn notifications on there.',
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-2.5 text-sm leading-relaxed text-neutral-600">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <button
              onClick={dismiss}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-primary py-3 font-medium text-white transition hover:bg-primary-dark"
            >
              Got it
            </button>
            <button
              onClick={dismiss}
              className="mt-2 min-h-[44px] w-full rounded-xl py-2.5 font-medium text-neutral-500 transition hover:text-charcoal"
            >
              Maybe later
            </button>
          </>
        ) : enabled ? (
          <>
            <h2 className="font-display text-lg font-semibold text-charcoal">
              You are all set
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">
              Notifications are on for this device. You can change this any
              time on the Notifications page.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-display text-lg font-semibold text-charcoal">
              Turn on notifications
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">
              Get new messages, gift alerts and go-live moments as they
              happen, even when the app is closed.
            </p>
            <button
              onClick={enable}
              disabled={busy}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-medium text-white transition hover:bg-primary-dark disabled:opacity-60"
            >
              {busy ? (
                <>
                  <IntimaLoader size="sm" />
                  Turning on...
                </>
              ) : (
                'Yes, enable'
              )}
            </button>
            <button
              onClick={dismiss}
              className="mt-2 min-h-[44px] w-full rounded-xl py-2.5 font-medium text-neutral-500 transition hover:text-charcoal"
            >
              Maybe later
            </button>
          </>
        )}
      </div>
    </div>
  )
}
