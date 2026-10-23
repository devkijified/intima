'use client'

import { useEffect, useRef, useState } from 'react'
import { COIN_PACKAGES } from '@/lib/coins/packages'
import { GIFT_CATEGORY_CHIPS, GIFT_CATEGORY_OF, type GiftCategoryKey } from '@/lib/gifts/categories'
import { ngnForCoins } from '@/lib/utils/helpers'
import { ChevronLeft, Star, X } from '@/lib/icons'
import { useSheetDrag } from '@/lib/hooks/useSheetDrag'
import type { GiftCatalogItem } from './giftTypes'
import GiftObjectIcon from './GiftObjectIcon'

type PanelTab = 'all' | 'favs' | 'recent' | 'premium' | GiftCategoryKey

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
 * The gift store sheet, modelled on TikTok LIVE's gift panel: a
 * bottom sheet over the room (the video stays visible above it),
 * one scrollable chip row to browse by (All, Favourites, Recent,
 * the store categories, and Premium for the animated gifts), a
 * three-column grid ordered by price with every tile carrying its
 * exact naira twin, the host's pinned gift menu as a strip above
 * the grid, and a sticky footer with the coin balance and a
 * Recharge-style Buy coins button that swaps the sheet to the coin
 * packages in place (checkout still runs through /api/coins/buy,
 * and the parent stashes the selected gift so the room restores
 * it on return). Tap a gift to send it, TikTok style; after a
 * float or burst send, a combo button with a 4s draining ring
 * re-sends per tap with running count and spend; when the window
 * lapses, the parent posts the summary to chat. Stage and
 * takeover gifts never combo.
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
  onBalanceRefresh,
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
  onBalanceRefresh?: () => Promise<number | null>
  onClose: () => void
}) {
  const [view, setView] = useState<'gifts' | 'packages'>('gifts')
  const [tab, setTab] = useState<PanelTab>('all')
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
        : tab === 'premium'
          ? catalog.filter((g) => g.anim_tier === 'stage' || g.anim_tier === 'takeover')
          : tab === 'all'
            ? catalog
            : catalog.filter((g) => GIFT_CATEGORY_OF[g.id] === tab)

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

  // Closing always ends an open combo first, whichever way the user
  // closes: backdrop, X, or a drag on the sheet handle (the sheet
  // drag habit from the map sheets, wired to the same closer).
  const handleClose = () => {
    endCombo(true)
    onClose()
  }
  const { sheetRef, handleProps } = useSheetDrag(handleClose)

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

  // TikTok-style recharge: checkout opens in a tab over the stream
  // (pre-opened inside the tap so mobile browsers allow it), the room
  // keeps playing behind this panel, and the balance polls until the
  // top-up lands, then the panel returns to the gifts on its own. If
  // the browser blocks the tab, fall back to the full-page checkout
  // with the gift return stash, exactly as before.
  const [awaitingPay, setAwaitingPay] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const startBalancePoll = (startBalance: number) => {
    if (!onBalanceRefresh) return
    if (pollRef.current) clearInterval(pollRef.current)
    let tries = 0
    pollRef.current = setInterval(async () => {
      tries += 1
      if (tries > 40) { if (pollRef.current) clearInterval(pollRef.current); setAwaitingPay(false); return }
      const b = await onBalanceRefresh().catch(() => null)
      if (typeof b === 'number' && b > startBalance) {
        if (pollRef.current) clearInterval(pollRef.current)
        setAwaitingPay(false)
        setBuying(null)
        setBalancePulse(true)
        setTimeout(() => setBalancePulse(false), 1600)
        setView('gifts')
      }
    }, 3000)
  }

  const buyPackage = async (packageId: string) => {
    if (buying) return
    setBuying(packageId)
    setBuyError('')
    onBuyCoinsStart(selectedId)
    const startBalance = balance ?? 0
    // Pre-open inside the tap: after an await, window.open loses the
    // user-gesture allowance on mobile browsers.
    const win = typeof window !== 'undefined' ? window.open('', '_blank') : null
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
      if (win) {
        win.location.href = data.authorizationUrl
        setAwaitingPay(true)
        setBuying(null)
        startBalancePoll(startBalance)
      } else {
        window.location.href = data.authorizationUrl
      }
    } catch (e) {
      if (win) win.close()
      setBuyError(e instanceof Error ? e.message : 'Could not start checkout')
      setBuying(null)
    }
  }

  const comboGift = combo?.gift ?? null
  const comboBusy = !!comboGift && sendingId === comboGift.id

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div
        ref={sheetRef}
        className="giftfx-panel relative animate-sheet-up rounded-t-[28px] bg-[#141419] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 shadow-sheet"
      >
        <div {...handleProps} className="cursor-grab touch-none select-none pb-1">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20" />
        </div>

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
            <div className="mb-3 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
              <span className="text-xs font-medium text-white/60">Your balance</span>
              <span className={`text-sm font-bold ${balancePulse ? 'animate-pulse text-gold' : 'text-white'}`}>
                {balance === null ? '...' : balance.toLocaleString()} coins
                {balance !== null && <span className="ml-1.5 text-xs font-medium text-white/50">≈ ₦{(balance * 10).toLocaleString()}</span>}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {COIN_PACKAGES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => buyPackage(p.id)}
                  disabled={buying !== null}
                  className={`relative rounded-2xl px-4 py-3.5 text-left transition-all active:scale-[0.98] disabled:opacity-50 ${
                    p.id === 'popular'
                      ? 'bg-gradient-to-br from-gold/25 to-gold/5 ring-2 ring-gold'
                      : 'bg-white/5 ring-1 ring-white/10'
                  }`}
                >
                  {p.id === 'popular' && (
                    <span className="absolute -top-2 right-3 rounded-full bg-gold px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-charcoal">
                      Most popular
                    </span>
                  )}
                  <span className="block text-lg font-extrabold leading-tight text-white">
                    {p.coins.toLocaleString()} <span className="text-xs font-bold text-white/60">coins</span>
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-gold">₦{p.priceNgn.toLocaleString()}</span>
                  <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-white/40">{p.label}</span>
                  {buying === p.id && <span className="mt-1 block text-[11px] font-semibold text-white/70">Opening checkout...</span>}
                </button>
              ))}
            </div>
            {awaitingPay && (
              <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-gold/15 px-4 py-3 ring-1 ring-gold/50">
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gold/30 border-t-gold" aria-hidden />
                <p className="text-xs leading-relaxed text-white/85">
                  Checkout is open in a new tab. Pay there and your coins appear here on their own.
                  The stream keeps playing.
                </p>
              </div>
            )}
            {buyError && <p className="mt-3 text-center text-xs font-medium text-red-300">{buyError}</p>}
            <p className="mt-3 text-center text-[11px] text-white/40">
              Secure checkout by Paystack: card, transfer, or USSD. Coins land as soon as payment confirms.
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
                      <GiftObjectIcon giftId={g.id} size={24} />
                      <span className="max-w-[180px] truncate">
                        <span className="font-semibold">{g.name}</span>
                        <span className="text-white/60"> · {giftMenu[g.id]}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'favs', label: 'Favourites' },
                  { key: 'recent', label: 'Recent' },
                  ...GIFT_CATEGORY_CHIPS,
                  { key: 'premium', label: 'Premium' },
                ] as Array<{ key: PanelTab; label: string }>
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-pressed={tab === t.key}
                  className={`min-h-[40px] shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
                    tab === t.key
                      ? t.key === 'premium'
                        ? 'bg-gold text-charcoal'
                        : 'bg-primary text-white'
                      : 'bg-white/5 text-white/55'
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

            <div className="grid max-h-[44vh] grid-cols-3 gap-2 overflow-y-auto">
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
                      <GiftObjectIcon giftId={g.id} size={46} />
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
                    : tab === 'all'
                      ? 'Gift catalog unavailable.'
                      : 'No gifts in this section yet.'}
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
                  <GiftObjectIcon giftId={comboGift.id} size={20} />
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
