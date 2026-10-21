'use client'

import { useEffect, useState } from 'react'
import { Bank } from '@/lib/icons'
import { HelpTip } from '@/components/ui/Tooltip'

interface DedicatedAccount {
  accountNumber: string
  bankName: string
  accountName: string
}

/**
 * The caller's permanent personal account number (Paystack DVA).
 * Renders nothing unless the server says dedicated accounts are
 * enabled for this user: the endpoint answers { enabled: false }
 * when the merchant account cannot host them, and the card quietly
 * stays out of the way so the per-transaction bank transfer
 * channel remains the rail.
 */
export function DedicatedAccountCard() {
  const [account, setAccount] = useState<DedicatedAccount | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    fetch('/api/wallet/dedicated-account')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => {
        if (live && d?.enabled && d.accountNumber) {
          setAccount({
            accountNumber: String(d.accountNumber),
            bankName: d.bankName ?? '',
            accountName: d.accountName ?? '',
          })
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  if (!account) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account.accountNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="mt-4 rounded-3xl border-2 border-gold/60 bg-gold/5 p-5">
      <p className="flex items-center gap-1.5 text-sm font-bold text-charcoal">
        <Bank className="h-4 w-4 text-gold" aria-hidden /> Your personal account number
        <HelpTip text="This account number belongs to you alone. Transfer any amount to it from any bank app and your coins land automatically at 1 coin per ₦10, minimum ₦100. No reference or narration needed." />
      </p>
      <button
        onClick={copy}
        className="mt-3 flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left active:scale-[0.99]"
        aria-label={`Copy account number ${account.accountNumber}`}
      >
        <span>
          <span className="block text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            {account.bankName || 'Bank'}
          </span>
          <span className="block font-mono text-lg font-bold tracking-wider text-charcoal">
            {account.accountNumber}
          </span>
          <span className="block text-xs text-neutral-500">{account.accountName}</span>
        </span>
        <span className="text-xs font-medium text-neutral-400">{copied ? 'Copied!' : 'Tap to copy'}</span>
      </button>
      <p className="mt-3 text-center text-xs text-neutral-500">
        Transfer any amount here from any bank app. Your coins land automatically, 1 coin per ₦10.
      </p>
    </div>
  )
}
