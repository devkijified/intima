'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Radio, Wallet, Share, LayoutDashboard, X } from '@/lib/icons'

const STEPS = [
  {
    icon: LayoutDashboard,
    title: 'This is your dashboard',
    body: 'Your bookings, profile views, and ratings live here. Check it every morning to see how your page is doing.',
  },
  {
    icon: Radio,
    title: 'Go live and earn gifts',
    body: 'Tap Live and start a stream from your phone. Viewers send gifts, and gifts turn into coins in your wallet.',
  },
  {
    icon: Wallet,
    title: 'Your money lives in Earnings',
    body: 'Gift coins build up in your wallet. When you reach the minimum, request a cash-out and we pay your bank account.',
  },
  {
    icon: Share,
    title: 'Share your page everywhere',
    body: 'Your profile link is your shop front. Put it in your bios and status updates so clients book you here, where the fee protects you both.',
  },
]

/**
 * First-run walkthrough for companions: a short guided tour shown once
 * on the dashboard. Dismissal is remembered per user on this device.
 */
export function Walkthrough({ userId, profilePath }: { userId: string; profilePath: string }) {
  const [visible, setVisible] = useState(false)
  const [index, setIndex] = useState(0)
  const key = `intima_walkthrough_done_${userId}`

  useEffect(() => {
    try {
      if (!localStorage.getItem(key)) setVisible(true)
    } catch { /* private mode: just skip */ }
  }, [key])

  const finish = () => {
    try { localStorage.setItem(key, '1') } catch { /* ignore */ }
    setVisible(false)
  }

  if (!visible) return null
  const current = STEPS[index]
  const Icon = current.icon
  const last = index === STEPS.length - 1

  return (
    <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-6 animate-pop-in">
      <div className="card-luxe mx-auto max-w-md p-5 shadow-lift">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-muted">
            <Icon aria-hidden className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold tracking-tight text-charcoal">{current.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-neutral-500">{current.body}</p>
          </div>
          <button onClick={finish} aria-label="Close walkthrough" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-300 hover:text-neutral-500">
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 w-5 rounded-full ${i <= index ? 'bg-primary' : 'bg-neutral-200'}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={finish} className="inline-flex min-h-[44px] items-center px-2 py-2 text-[13px] font-medium text-neutral-400">Skip tour</button>
            {last ? (
              <Link href={profilePath} onClick={finish} className="btn-luxe min-h-[44px] px-4 py-2 text-[13px]">See my page</Link>
            ) : (
              <button onClick={() => setIndex((i) => i + 1)} className="btn-luxe flex min-h-[44px] items-center gap-1 px-4 py-2 text-[13px]">
                Next <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
