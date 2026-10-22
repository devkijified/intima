'use client'

import { useEffect, useState } from 'react'
import { Gift } from '@/lib/icons'
import { IntimaLoader } from '@/components/shared/IntimaLoader'
import GiftObjectIcon from '@/components/live/GiftObjectIcon'
import { formatCompactCount, ngnForCoins } from '@/lib/utils/helpers'
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

type StatusFilter = 'all' | 'active' | 'inactive'
type GiftSort = 'price-asc' | 'price-desc' | 'name'

export default function AdminGiftsPage() {
  const [rows, setRows] = useState<GiftRow[] | null>(null)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<GiftSort>('price-asc')

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

  const visible = (rows ?? [])
    .filter((r) => {
      const q = query.trim().toLowerCase()
      if (q && !r.name.toLowerCase().includes(q) && !r.id.toLowerCase().includes(q)) return false
      if (statusFilter === 'active' && !r.is_active) return false
      if (statusFilter === 'inactive' && r.is_active) return false
      return true
    })
    .sort((a, b) => {
      if (sort === 'price-desc') return b.coin_cost - a.coin_cost
      if (sort === 'name') return a.name.localeCompare(b.name)
      return a.coin_cost - b.coin_cost
    })

  const chipCls = (active: boolean) =>
    `inline-flex min-h-[44px] items-center rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
      active ? 'bg-primary text-white' : 'bg-white text-neutral-600 ring-1 ring-black/[0.06] hover:bg-cream'
    }`

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

      {rows !== null && rows.length > 0 && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search gifts by name..."
              aria-label="Search gifts by name"
              className="min-h-[44px] min-w-0 flex-1 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-charcoal outline-none focus:border-primary sm:flex-none sm:basis-56"
            />
            {([
              ['all', 'All'],
              ['active', 'Active'],
              ['inactive', 'Inactive'],
            ] as [StatusFilter, string][]).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setStatusFilter(key)} className={chipCls(statusFilter === key)}>
                {label}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-[13px] font-medium text-neutral-500">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as GiftSort)}
                className="min-h-[44px] rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-charcoal ring-1 ring-black/[0.06] outline-none focus:ring-primary"
              >
                <option value="price-asc">Coins, low to high</option>
                <option value="price-desc">Coins, high to low</option>
                <option value="name">Name A to Z</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Showing {formatCompactCount(visible.length)} of {formatCompactCount(rows.length)} gifts
          </p>
        </>
      )}

      {rows === null ? (
        <div data-page-loader className="flex justify-center py-16">
          <IntimaLoader size="lg" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-500">No gifts in the catalog yet.</p>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-500">No gifts match that filter.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.map((row) => {
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
