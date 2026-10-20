'use client'

import { useEffect, useState } from 'react'
import { Zap } from '@/lib/icons'

/** Boost: companions spend 500 coins for 30 min top-of-map placement. */
export function BoostPanel() {
  const [activeUntil, setActiveUntil] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/boost/status').then((r) => r.json()).then((d) => {
      if (d?.endsAt && new Date(d.endsAt).getTime() > Date.now()) setActiveUntil(d.endsAt)
    }).catch(() => {})
  }, [])

  async function boost() {
    setBusy(true); setMsg('')
    const res = await fetch('/api/boost', { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) {
      setActiveUntil(d.endsAt)
      setMsg('Boosted. You are pinned to the top of the map for 30 minutes.')
    } else if (res.status === 402) {
      setMsg(d.error ?? 'Not enough coins. Top up from Coins or your earnings.')
    } else {
      setMsg(d.error ?? 'Could not start boost.')
    }
  }

  const remaining = activeUntil
    ? Math.max(0, Math.round((new Date(activeUntil).getTime() - Date.now()) / 60000))
    : 0

  return (
    <div className="rounded-3xl border border-neutral-200/80 bg-white p-5">
      <h3 className="flex items-center gap-2 font-semibold text-charcoal">
        <Zap className="h-5 w-5 text-gold" /> Boost visibility
      </h3>
      <p className="mt-1 text-xs text-neutral-500">
        Pin yourself to the top of the map and browse lists for 30 minutes. Costs 500 coins.
      </p>
      {remaining > 0 ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
          <Zap className="h-3.5 w-3.5" /> Boosted · {remaining} min left
        </p>
      ) : (
        <button
          onClick={boost}
          disabled={busy}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-charcoal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Zap className="h-4 w-4 text-gold" /> {busy ? 'Activating…' : 'Boost for 30 min · 500 coins'}
        </button>
      )}
      {msg && <p className="mt-2 text-xs text-neutral-600">{msg}</p>}
    </div>
  )
}
