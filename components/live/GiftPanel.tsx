'use client'

import { useEffect, useRef, useState } from 'react'
import { COIN_PACKAGES } from '@/lib/coins/packages'
import { ngnForCoins } from '@/lib/utils/helpers'
import { ChevronLeft, Star, X } from '@/lib/icons'
import type { GiftCatalogItem } from './giftTypes'

export type GiftSendResult = 'ok' | 'topup' | 'fail'

interface ComboState {
  gift: GiftCatalogItem
  count: number
  totalCoins: number
  cycle: number
}

const COMBO_WINDOW_MS = 4000
const FAVS_KEY = 'intima_gift_favs'
const RECENT_KEY = 'intima_gift_recent'

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* storage unavailable */
  }
}

/**
 * The gift store sheet: TikTok-grade panel over the live room.
 * Four-column grid ordered by price, every tile carrying its exact
 * naira twin; All / Favourites / Recent tabs; the host's pinned
 * gift menu as a strip above the grid; a sticky footer with the
 * balance and Buy coins, which swaps the sheet to the coin packages
 * in place (checkout still runs through /api/coins/buy, and the
 * parent stashes the selected gift so the room restores it on
 * return). After a float or burst send, a combo button with a 4s
 * draining ring re-sends per tap with running count and spend;
 * when the window lapses, the parent posts the summary to chat.
 * Stage and takeover gifts never combo.
 */
export function GiftPanel({
  catalog,
  balance,
  hostName,
  giftMenu,
  sendingId,
  initialGiftId,
  onSend,
  onComboSummary,
  onBuyCoinsStart,
  onClose,
}: {
  catalog: GiftCatalogItem[]
  balance: number | null
  hostName: string
  giftMenu: Record<string, string>
  sendingId: string | null
  initialGiftId?: string | null
  onSend: (gift: GiftCatalogItem) => Promise<GiftSendResult>
  onComboSummary: (gift: GiftCatalogItem, count: number) => void
  onBuyCoinsStart: (giftId: string | null) => void
  onClose: () => void
}) {
  const [view, setView] = useState<'gifts' | 'packages'>('gifts')
  const [tab, setTab] = useState<'all' | 'favs' | 'recent'>('all')
  const [favs, setFavs] = useState<string[]>(() => readList(FAVS_KEY))
  const [recent, setRecent] = useState<string[]>(() => readList(RECENT_KEY))
  const [selectedId, setSelectedId] = useState<string | null>(initialGiftId ?? null)
  const [needTopup, setNeedTopup] = useState(false)
  const [shakeId, setShakeId] = useState<string | null>(null)
  const [balancePulse, setBalancePulse] = useState(false)
  const [combo, setCombo] = useState<ComboState | null>(null)
  const [buying, setBuying] = useState<string | null>(null)
  const [buyError, setBuyError] = useState('')

  const comboRef = useRef<ComboState | null>(null)
  comboRef.current = combo
  const comboTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tileRefs = useRef(new Map<string, HTMLButtonElement>())

  const menuEntries = catalog
    .filter((g) => (giftMenu[g.id] ?? '').trim().length > 0)
    .slice(0, 3)

  const visibleGifts =
    tab === 'favs'
      ? catalog.filter((g) => favs.includes(g.id))
      : tab === 'recent'
        ? recent
            .map((id) => catalog.find((g) => g.id === id))
            .filter((g): g is GiftCatalogItem => !!g)
        : catalog

  const endCombo = (fireSummary: boolean) => {
    if (comboTimer.current) {
      clearTimeout(comboTimer.current)
      comboTimer.current = null
    }
    const c = comboRef.current
    if (fireSummary && c && c.count >= 2) onComboSummary(c.gift, c.count)
    comboRef.current = null
    setCombo(null)
  }

  const armComboTimer = () => {
    if (comboTimer.current) clearTimeout(comboTimer.current)
    comboTimer.current = setTimeout(() => endCombo(true), COMBO_WINDOW_MS)
  }

  useEffect(
    () => () => {
      if (comboTimer.current) clearTimeout(comboTimer.current)
    },
    []
  )

  const flagInsufficient = (gift: GiftCatalogItem) => {
    setNeedTopup(true)
    setShakeId(gift.id)
    setBalancePulse(true)
    setTimeout(() => setShakeId(null), 450)
    setTimeout(() => setBalancePulse(false), 550)
  }

  const doSend = async (gift: GiftCatalogItem) => {
    if (sendingId) return
    if (balance !== null && gift.coin_cost > balance) {
      flagInsufficient(gift)
      return
    }
    const result = await onSend(gift)
    if (result === 'topup') {
      flagInsufficient(gift)
      return
    }
    if (result !== 'ok') return
    setNeedTopup(false)
    const nextRecent = [gift.id, ...recent.filter((x) => x !== gift.id)].slice(0, 8)
    setRecent(nextRecent)
    writeList(RECENT_KEY, nextRecent)
    if (gift.anim_tier === 'float' || gift.anim_tier === 'burst') {
      const prev = comboRef.current
      const next: ComboState =
        prev && prev.gift.id === gift.id
          ? { gift, count: prev.count + 1, totalCoins: prev.totalCoins + gift.coin_cost, cycle: prev.cycle + 1 }
          : { gift, count: 1, totalCoins: gift.coin_cost, cycle: 1 }
      comboRef.current = next
      setCombo(next)
      armComboTimer()
    } else {
      endCombo(true)
    }
  }

  const tapTile = (gift: GiftCatalogItem) => {
    setSelectedId(gift.id)
    void doSend(gift)
  }

  const toggleFav = (gift: GiftCatalogItem) => {
    const next = favs.includes(gift.id) ? favs.filter((x) => x !== gift.id) : [...favs, gift.id]
    setFavs(next)
    writeList(FAVS_KEY, next)
  }

  const tapMenuEntry = (gift: GiftCatalogItem) => {
    setSelectedId(gift.id)
    setTab('all')
    setTimeout(() => {
      tileRefs.current.get(gift.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 60)
  }

  const buyPackage = async (packageId: string) => {
    if (buying) return
    setBuying(packageId)
    setBuyError('')
    onBuyCoinsStart(selectedId)
    try {
      const res = await fetch('/api/coins/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.authorizationUrl) {
        throw new Error(data.error || 'Could not start checkout')
      }
      window.location.href = data.authorizationUrl
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : 'Could not start checkout')
      setBuying(null)
    }
  }

  const handleClose = () => {
    endCombo(true)
    onClose()
  }

  const comboGift = combo?.gift ?? null
  const comboBusy = !!comboGift && sendingId === comboGift.id

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="giftfx-panel relative animate-sheet-up rounded-t-[28px] bg-[#141419] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 shadow-sheet">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20" />

        {view === 'packages' ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <button
                onClick={() => setView('gifts')}
                aria-label="Back to gifts"
                className="flex min-h-[44px] items-center gap-1 rounded-full bg-white/10 py-2 pl-2 pr-4 text-xs font-bold text-white"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden /> Gifts
              </button>
              <p className="text-sm font-bold text-white">Buy coins</p>
              <span className="w-[76px]" />
            </div>
            <div className="space-y-2">
              {COIN_PACKAGES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => buyPackage(p.id)}
                  disabled={buying !== null}
                  className="flex min-h-[56px] w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <span>
                    <span className="block text-sm font-bold text-white">{p.label}</span>
                    <span className="block text-xs text-white/50">{p.coins.toLocaleString()} coins</span>
                  </span>
                  <span className="text-sm font-bold text-gold">₦{p.priceNgn.toLocaleString()}</span>
                </button>
              ))}
            </div>
            {buyError && <p className="mt-3 text-center text-xs font-medium text-red-300">{buyError}</p>}
            <p className="mt-3 text-center text-[11px] text-white/40">
              Secure checkout by Paystack. Your coins land as soon as payment confirms, and you come
              right back to this gift.
            </p>
          </>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-white">Send a gift</p>
              <button
                onClick={handleClose}
                aria-label="Close gift panel"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white active:scale-95"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {menuEntries.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-gold">
                  {hostName}&rsquo;s menu
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {menuEntries.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => tapMenuEntry(g)}
                      className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-left text-xs text-white transition-all active:scale-95 ${
                        selectedId === g.id ? 'border-gold/70 bg-gold/10' : 'border-white/10 bg-white/5'
                      }`}
                    >
                      <span className="text-lg leading-none">{g.emoji}</span>
                      <span className="max-w-[180px] truncate">
                        <span className="font-semibold">{g.name}</span>
                        <span className="text-white/60"> · {giftMenu[g.id]}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-3 flex gap-1 rounded-full bg-white/5 p-1">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'favs', label: 'Favourites' },
                  { key: 'recent', label: 'Recent' },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-pressed={tab === t.key}
                  className={`min-h-[44px] flex-1 rounded-full py-2 text-xs font-bold transition-colors ${
                    tab === t.key ? 'bg-primary text-white' : 'text-white/55'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {needTopup && (
              <div className="mb-3 rounded-2xl border border-gold/40 bg-gold/10 p-3 text-center">
                <p className="text-sm font-semibold text-gold">Not enough coins</p>
                <p className="mt-0.5 text-xs text-white/60">
                  Tap Buy coins below to top up without leaving the stream.
                </p>
              </div>
            )}

            <div className="grid max-h-60 grid-cols-4 gap-2 overflow-y-auto">
              {visibleGifts.map((g) => {
                const unaffordable = balance !== null && g.coin_cost > balance
                const isFav = favs.includes(g.id)
                return (
                  <div key={g.id} className="relative">
                    <button
                      ref={(el) => {
                        if (el) tileRefs.current.set(g.id, el)
                        else tileRefs.current.delete(g.id)
                      }}
                      onClick={() => tapTile(g)}
                      disabled={sendingId !== null}
                      aria-label={`Send ${g.name}, ${g.coin_cost} coins`}
                      className={`flex min-h-[44px] w-full flex-col items-center rounded-2xl border p-3 transition-all active:scale-95 disabled:opacity-50 ${
                        shakeId === g.id ? 'giftfx-shake-tile' : ''
                      } ${
                        g.anim_tier === 'takeover'
                          ? 'border-gold/60 bg-gold/10'
                          : g.anim_tier === 'stage'
                            ? 'border-primary/50 bg-primary/10'
                            : 'border-white/10 bg-white/5'
                      } ${selectedId === g.id ? 'ring-2 ring-gold' : ''} ${unaffordable ? 'opacity-60' : ''}`}
                    >
                      <span className="text-[34px] leading-none">{g.emoji}</span>
                      <span className="mt-1 text-[11px] font-medium text-white">{g.name}</span>
                      <span className="text-[11px] font-bold text-gold">
                        {sendingId === g.id ? '…' : `${g.coin_cost.toLocaleString()} coins`}
                      </span>
                      <span className="text-[10px] text-white/45">≈ {ngnForCoins(g.coin_cost)}</span>
                    </button>
                    <button
                      onClick={() => toggleFav(g)}
                      aria-label={isFav ? `Remove ${g.name} from favourites` : `Add ${g.name} to favourites`}
                      aria-pressed={isFav}
                      className="absolute right-0.5 top-0.5 flex h-9 w-9 items-center justify-center rounded-full active:scale-90"
                    >
                      <Star
                        className={`h-4 w-4 ${isFav ? 'fill-[#C9A84C] text-gold' : 'text-white/35'}`}
                        aria-hidden
                      />
                    </button>
                  </div>
                )
              })}
            </div>
            {visibleGifts.length === 0 && (
              <p className="py-6 text-center text-sm text-white/50">
                {tab === 'favs'
                  ? 'Tap the star on a gift to keep it here.'
                  : tab === 'recent'
                    ? 'Gifts you send will appear here.'
                    : 'Gift catalog unavailable.'}
              </p>
            )}

            {combo && comboGift && (
              <button
                onClick={() => void doSend(comboGift)}
                disabled={comboBusy}
                className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-[#C22A57] to-[#AC244D] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/40 transition-all active:scale-[0.98] disabled:opacity-60"
              >
                <span className="relative flex h-9 w-9 items-center justify-center">
                  <svg viewBox="0 0 36 36" className="absolute inset-0 h-9 w-9 -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
                    <circle
                      key={combo.cycle}
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      stroke="#C9A84C"
                      strokeWidth="3"
                      strokeLinecap="round"
                      pathLength={100}
                      strokeDasharray={100}
                      style={{ animation: `giftfx-combo-drain ${COMBO_WINDOW_MS}ms linear forwards` }}
                    />
                  </svg>
                  <span className="text-base leading-none">{comboGift.emoji}</span>
                </span>
                <span>
                  Combo ×{combo.count}
                  <span className="ml-2 font-normal text-white/80">
                    {combo.totalCoins.toLocaleString()} coins ({ngnForCoins(combo.totalCoins)})
                  </span>
                </span>
              </button>
            )}

            <div className="mt-3 flex items-center justify-between gap-3">
              <span
                className={`flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-2 text-xs font-bold text-gold ${balancePulse ? 'giftfx-pulse-once' : ''}`}
              >
                <span className="inline-block h-3 w-3 rounded-full bg-gold" />
                {balance === null ? '…' : balance.toLocaleString()} coins
                {balance !== null && <span className="font-normal text-gold/70">≈ {ngnForCoins(balance)}</span>}
              </span>
              <button
                onClick={() => setView('packages')}
                className={`flex min-h-[44px] items-center rounded-full bg-gold px-5 py-2.5 text-xs font-bold text-charcoal transition-all active:scale-95 ${needTopup ? 'giftfx-pulse-once' : ''}`}
              >
                Buy coins
              </button>
            </div>
            <p className="mt-3 text-center text-[11px] text-white/40">
              1 coin = ₦10 · Gifts support {hostName}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
