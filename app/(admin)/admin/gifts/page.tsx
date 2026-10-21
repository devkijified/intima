'use client'

import { useEffect, useState } from 'react'
import { Gift } from '@/lib/icons'
import { IntimaLoader } from '@/components/shared/IntimaLoader'
import GiftObjectIcon from '@/components/live/GiftObjectIcon'
import { ngnForCoins } from '@/lib/utils/helpers'
import type { GiftCatalogItem } from '@/components/live/giftTypes'

interface GiftRow extends GiftCatalogItem {
  is_active: boolean
}

const ANIM_LABEL: Record<string, string> = {
  float: 'Feed chip only',
  burst: 'Feed chip only',
  stage: 'Animated (premium)',
  takeover: 'Animated (premium)',
}

export default function AdminGiftsPage() {
  const [rows, setRows] = useState<GiftRow[] | null>(null)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch('/api/admin/gifts')
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error ?? 'Could not load the gift store')
      setRows([])
      return
    }
    setRows(data.gifts ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  const save = async (row: GiftRow, patch: { coin_cost?: number; is_active?: boolean }) => {
    setBusyId(row.id)
    setSavedId(null)
    const res = await fetch('/api/admin/gifts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, ...patch }),
    })
    const data = await res.json().catch(() => null)
    setBusyId(null)
    if (!res.ok) {
      setError(data?.error ?? 'Could not save that gift')
      return
    }
    setError('')
    setRows((prev) => (prev ?? []).map((r) => (r.id === row.id ? { ...r, ...data.gift } : r)))
    setSavedId(row.id)
  }

  const savePrice = (row: GiftRow) => {
    const raw = drafts[row.id]
    if (raw === undefined) return
    const cost = Number(raw.replace(/[^0-9]/g, ''))
    if (!Number.isInteger(cost) || cost < 1) {
      setError('Price must be a whole number of coins, at least 1')
      return
    }
    save(row, { coin_cost: cost })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Gift size={20} />
        </span>
        <div>
          <h1 className="text-xl font-bold text-charcoal">Gift store</h1>
          <p className="text-sm text-neutral-500">
            Prices are in coins (1 coin = ₦10). Changes apply in the live gift panel right away.
            Only premium gifts (1,000 coins and up) play the big animation.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</p>
      )}

      {rows === null ? (
        <div data-page-loader className="flex justify-center py-16">
          <IntimaLoader size="lg" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-500">No gifts in the catalog yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((row) => {
            const draft = drafts[row.id]
            const draftCost = draft !== undefined ? Number(draft.replace(/[^0-9]/g, '')) : NaN
            const dirty = draft !== undefined && draftCost !== row.coin_cost
            return (
              <div
                key={row.id}
                className={`flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 ${
                  row.is_active ? '' : 'opacity-60'
                }`}
              >
                <GiftObjectIcon giftId={row.id} size={44} />
                <div className="min-w-[120px] flex-1">
                  <p className="text-sm font-semibold text-charcoal">{row.name}</p>
                  <p className="text-xs text-neutral-400">
                    {row.id} · {ANIM_LABEL[row.anim_tier] ?? row.anim_tier}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={`Price in coins for ${row.name}`}
                    value={draft ?? String(row.coin_cost)}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [row.id]: e.target.value.replace(/[^0-9]/g, '') }))
                    }
                    className="w-24 rounded-lg border border-neutral-300 px-2.5 py-2 text-right text-sm font-semibold text-charcoal outline-none focus:border-primary"
                  />
                  <span className="text-xs text-neutral-500">coins</span>
                </div>
                <span className="w-20 text-xs text-neutral-400">
                  {ngnForCoins(Number.isInteger(draftCost) && draft !== undefined ? draftCost : row.coin_cost)}
                </span>
                <button
                  type="button"
                  disabled={!dirty || busyId === row.id}
                  onClick={() => savePrice(row)}
                  className="rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-white transition disabled:bg-neutral-200 disabled:text-neutral-400"
                >
                  {busyId === row.id ? 'Saving' : savedId === row.id && !dirty ? 'Saved' : 'Save price'}
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => save(row, { is_active: !row.is_active })}
                  className={`rounded-full px-3.5 py-2 text-xs font-bold transition ${
                    row.is_active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {row.is_active ? 'In store' : 'Hidden'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
