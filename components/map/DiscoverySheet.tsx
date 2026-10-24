'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, ChevronUp, SearchX } from '@/lib/icons';
import { formatCompactCount, formatPrice } from '@/lib/utils/helpers';
import type { MapProvider } from '@/lib/map/providers';

/**
 * The map's discovery sheet: the bottom companion carousel's
 * replacement. The map stays the screen; the sheet is a docked
 * panel with three snaps (peek, half, full) that the user drags
 * or taps open when they want the list, and the map never loses
 * its position to it.
 *
 * Peek shows only the honest in-area count. Expanded shows a
 * vertically scrolling list of the companions in the current
 * map view, rendered in pages so a thousand companions never
 * become a thousand DOM rows at once.
 */

export type SheetSnap = 'peek' | 'half' | 'full';

const PEEK_PX = 84;
const PAGE = 30;

function snapHeightPx(snap: SheetSnap): number {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  if (snap === 'peek') return PEEK_PX;
  if (snap === 'half') return Math.round(vh * 0.46);
  return Math.round(vh * 0.78);
}

interface DiscoverySheetProps {
  /** Companions in the current map view, filters applied. */
  providers: MapProvider[];
  ready: boolean;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  onSelect: (provider: MapProvider) => void;
  /** Kilometres from the user, when their location is known. */
  distanceKmFor?: (provider: MapProvider) => number | null;
  filtersActive: boolean;
  onClearFilters: () => void;
  /** Sit above the signed-in bottom navigation bar. */
  aboveNav: boolean;
  selectedId?: string | null;
}

export function DiscoverySheet({
  providers,
  ready,
  snap,
  onSnapChange,
  onSelect,
  distanceKmFor,
  filtersActive,
  onClearFilters,
  aboveNav,
  selectedId,
}: DiscoverySheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE);

  // A new result set starts from the first page again.
  const setKey = `${providers.length}:${providers[0]?.id ?? ''}`;
  const setKeyRef = useRef(setKey);
  useEffect(() => {
    if (setKeyRef.current !== setKey) {
      setKeyRef.current = setKey;
      setVisibleCount(PAGE);
    }
  }, [setKey]);

  const count = providers.length;
  const visible = providers.slice(0, visibleCount);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = sheetRef.current;
    if (!el) return;
    dragRef.current = { startY: e.clientY, startH: el.getBoundingClientRect().height, moved: false };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const el = sheetRef.current;
    if (!drag || !el) return;
    const dy = drag.startY - e.clientY;
    if (Math.abs(dy) > 6) drag.moved = true;
    const vh = window.innerHeight;
    const h = Math.min(vh * 0.85, Math.max(64, drag.startH + dy));
    el.style.height = `${h}px`;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const el = sheetRef.current;
    setDragging(false);
    if (!drag || !el) return;
    const h = el.getBoundingClientRect().height;
    el.style.height = '';
    dragRef.current = null;
    if (!drag.moved) {
      // A tap on the header toggles peek and half.
      onSnapChange(snap === 'peek' ? 'half' : 'peek');
      return;
    }
    // Snap to the nearest resting height.
    const candidates: Array<[SheetSnap, number]> = [
      ['peek', snapHeightPx('peek')],
      ['half', snapHeightPx('half')],
      ['full', snapHeightPx('full')],
    ];
    let best: SheetSnap = 'peek';
    let bestDist = Infinity;
    for (const [name, px] of candidates) {
      const d = Math.abs(px - h);
      if (d < bestDist) {
        bestDist = d;
        best = name;
      }
    }
    onSnapChange(best);
    void e;
  };

  return (
    <div
      ref={sheetRef}
      className="absolute inset-x-0 z-30 flex flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-[#101016]/95 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] backdrop-blur-md sm:inset-x-auto sm:left-4 sm:w-[380px] sm:rounded-3xl sm:border sm:border-white/10"
      style={{
        bottom: aboveNav ? 'calc(74px + env(safe-area-inset-bottom))' : 'max(0.5rem, env(safe-area-inset-bottom))',
        height: snapHeightPx(snap),
        transition: dragging ? 'none' : 'height 280ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
      role="region"
      aria-label="Companions in this area"
    >
      {/* Drag and tap zone: the header. The list below scrolls
          freely; the drag never starts from it. */}
      <div
        className="shrink-0 cursor-grab touch-none select-none px-4 pb-2 pt-2.5 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="button"
        aria-expanded={snap !== 'peek'}
        aria-label={snap === 'peek' ? 'Browse companions in this area' : 'Collapse companion list'}
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-white/25" aria-hidden />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-semibold text-white">
            {!ready
              ? 'Finding companions…'
              : count === 0
                ? 'No companions in this area'
                : `${formatCompactCount(count)} ${count === 1 ? 'companion' : 'companions'} in this area`}
          </p>
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-white/60">
            {filtersActive && <span className="rounded-full bg-[#C9A84C] px-2 py-0.5 font-semibold text-charcoal">Filters on</span>}
            <ChevronUp
              aria-hidden
              className={`h-4 w-4 transition-transform duration-300 ${snap === 'peek' ? '' : 'rotate-180'}`}
            />
          </span>
        </div>
        {snap === 'peek' && ready && count > 0 && (
          <p className="mt-0.5 text-xs text-white/50">Drag up or tap to browse the list</p>
        )}
      </div>

      {snap !== 'peek' && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
          {!ready ? (
            <div className="space-y-1 px-2 pb-4" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-3 px-2 py-3">
                  <div className="h-[52px] w-[52px] shrink-0 rounded-2xl bg-white/10" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3.5 w-2/5 rounded bg-white/10" />
                    <div className="h-3 w-3/5 rounded bg-white/[0.07]" />
                  </div>
                </div>
              ))}
            </div>
          ) : count === 0 ? (
            <div className="px-6 pb-8 pt-4 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#AC244D]/15">
                <SearchX aria-hidden className="h-6 w-6 text-[#AC244D]" />
              </div>
              <p className="text-sm font-semibold text-white">Nothing here matches</p>
              <p className="mx-auto mt-1 max-w-[260px] text-xs leading-relaxed text-white/55">
                {filtersActive
                  ? 'No companions in this part of the map match your filters. Clear them, or move the map to look elsewhere.'
                  : 'No companions are showing in this part of the map yet. Zoom out or move the map to look elsewhere.'}
              </p>
              {filtersActive && (
                <button
                  onClick={onClearFilters}
                  className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#AC244D] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#8F1D40] active:scale-95"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <ul className="pb-2">
                {visible.map((p) => {
                  const km = distanceKmFor ? distanceKmFor(p) : null;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(p)}
                        aria-current={selectedId === p.id || undefined}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-white/10 ${
                          selectedId === p.id ? 'bg-white/[0.07]' : 'hover:bg-white/5'
                        }`}
                      >
                        <span className="relative shrink-0">
                          <img
                            src={p.avatar}
                            alt=""
                            loading="lazy"
                            className={`h-[52px] w-[52px] rounded-2xl object-cover ${p.trustTier === 'elite' ? 'ring-2 ring-gold' : 'ring-1 ring-white/20'}`}
                          />
                          {p.available && (
                            <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-[#101016] bg-green-500" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[15px] font-semibold text-white">
                              {p.displayName}
                            </span>
                            {p.verified && <BadgeCheck aria-hidden className="h-4 w-4 shrink-0 text-[#C9A84C]" />}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-white/55">
                            {p.area} · {p.city}
                            {km !== null && ` · ${km < 10 ? km.toFixed(1) : Math.round(km)} km away`}
                          </span>
                          {p.rating !== null && (
                            <span className="mt-0.5 block text-xs text-white/55">
                              ★ {p.rating.toFixed(1)} ({formatCompactCount(p.reviewCount)} reviews)
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right">
                          {p.rateShortTime !== null ? (
                            <span className="block text-sm font-bold text-white">{formatPrice(p.rateShortTime)}</span>
                          ) : (
                            <span className="block text-xs text-white/45">Rate on request</span>
                          )}
                          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.available ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-white/50'}`}>
                            {p.available ? 'Available' : 'Away'}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {visibleCount < count && (
                <div className="px-4 pb-5">
                  <button
                    onClick={() => setVisibleCount((n) => n + PAGE)}
                    className="flex min-h-[44px] w-full items-center justify-center rounded-full bg-white/10 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/15 active:scale-[0.98]"
                  >
                    Show more ({formatCompactCount(count - visibleCount)} more)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
