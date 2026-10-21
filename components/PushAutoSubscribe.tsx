'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, X } from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { pushState, subscribePush, iosNeedsInstall } from '@/lib/push-client'
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
// Enable. (The previous version fired the system prompt cold, 2.5s
// after first load, which earns denials that can never be re-asked.)
// Signed-in users only, on home surfaces; Maybe later snoozes for 3
// days; a granted or denied system permission is final.
export default function PushAutoSubscribe() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
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
    // iOS Safari can't do push until the app is on the Home Screen; the
    // install prompt and the notifications page cover that path.
    if (iosNeedsInstall()) return

    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getUser()
        if (!data.user || cancelled) return
        const state = await pushState()
        if (cancelled) return
        if (state === 'available') {
          setVisible(true)
        } else {
          // Subscribed, denied or unsupported: never show the card.
          markDone()
        }
      } catch { /* silent */ }
    }, 2500)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [pathname])

  if (!visible) return null

  const dismiss = () => {
    snooze()
    setVisible(false)
  }

  const enable = async () => {
    setBusy(true)
    try {
      const res = await subscribePush()
      if (res.ok) {
        markDone()
        setEnabled(true)
        setTimeout(() => setVisible(false), 1800)
      } else if (res.reason === 'denied') {
        // The system prompt was answered No: respect it permanently.
        markDone()
        setVisible(false)
      } else {
        snooze()
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
        {enabled ? (
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
