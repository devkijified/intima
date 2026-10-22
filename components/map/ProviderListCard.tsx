'use client';

import { BadgeCheck, Star, Zap, Crown, Plane } from '@/lib/icons';
import { formatPrice } from '@/lib/utils/helpers';
import { formatRecency } from '@/lib/utils/recency';
import { PhotoWatermark } from '@/components/media/PhotoWatermark';
import type { MapProvider } from '@/lib/map/providers';

interface ProviderListCardProps {
  provider: MapProvider;
  onSelect: (provider: MapProvider) => void;
  /** Why she matches the active city filter despite being based elsewhere. */
  travelNote?: string | null;
}

/**
 * Airbnb-style provider card for the grid list view: photo on top with
 * verified/available overlays, then name + rating, area, and the
 * short-time rate. Tapping opens the same bottom sheet as a map pin,
 * so selection stays synced across views.
 */
export function ProviderListCard({ provider, onSelect, travelNote }: ProviderListCardProps) {
  const nameLine =
    provider.age !== null ? `${provider.displayName}, ${provider.age}` : provider.displayName;
  const recency = formatRecency(provider.lastActiveAt);

  return (
    <li className="cv-card">
      <button
        onClick={() => onSelect(provider)}
        className={'group flex w-full flex-col overflow-hidden rounded-[24px] bg-white text-left shadow-soft ring-1 transition-all duration-200 active:scale-[0.98] ' +
          'sm:hover:-translate-y-1 sm:hover:shadow-lift ' +
          (provider.trustTier === 'elite' ? 'ring-[#C9A84C]/60' : 'ring-black/[0.05]')}
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-neutral-100">
          <img
            src={provider.avatar}
            alt={provider.displayName}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          {/* Top veil keeps the badges legible on bright photos. */}
          <div className="photo-veil-top pointer-events-none absolute inset-x-0 top-0 h-16" />
          {provider.trustTier === 'elite' ? (
            <span className="badge-elite absolute left-2 top-2 shadow-md">
              <Crown className="h-3 w-3" />
              Elite
            </span>
          ) : provider.verified && (
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-[#AC244D] px-2 py-1 text-[11px] font-semibold text-white shadow-md">
              <BadgeCheck className="h-3 w-3" />
              Verified
            </span>
          )}
          {provider.available && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              Available
            </span>
          )}
          {provider.boosted && (
            <span className={'badge-elite absolute left-2 ' + (provider.verified || provider.trustTier === 'elite' ? 'top-9' : 'top-2')}>
              <Zap className="h-3 w-3" /> Boosted
            </span>
          )}
          <PhotoWatermark />
        </div>
        <div className="p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-display text-[15px] font-semibold tracking-tight text-charcoal">
              {nameLine}
            </p>
            {provider.rating !== null && (
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-charcoal">
                <Star className="h-3 w-3 fill-[#C9A84C] text-[#C9A84C]" />
                {provider.rating.toFixed(1)}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-neutral-500">
            {provider.area}, {provider.city}
          </p>
          {travelNote ? (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#AC244D]/[0.08] px-2 py-0.5 text-[11px] font-semibold text-[#AC244D]">
              <Plane className="h-3 w-3" /> {travelNote}
            </p>
          ) : provider.nextTour ? (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#C9A84C]/15 px-2 py-0.5 text-[11px] font-semibold text-charcoal">
              <Plane className="h-3 w-3 text-[#AC244D]" /> In {provider.nextTour.city} soon
            </p>
          ) : provider.travelMode === 'nationwide' ? (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#AC244D]/[0.08] px-2 py-0.5 text-[11px] font-semibold text-[#AC244D]">
              <Plane className="h-3 w-3" /> Can travel anywhere in Nigeria
            </p>
          ) : null}
          {recency && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {recency}
            </p>
          )}
          {provider.rateShortTime !== null ? (
            <p className="mt-1.5 text-[15px] font-bold text-[#AC244D]">
              {formatPrice(provider.rateShortTime)}{' '}
              <span className="text-xs font-medium text-neutral-400">short time</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-neutral-400">Rates not listed yet</p>
          )}
        </div>
      </button>
    </li>
  );
}

/** Shimmer placeholder matching the card shape while providers load. */
export function ProviderListSkeleton() {
  return (
    <li aria-hidden="true">
      <div className="overflow-hidden rounded-[20px] bg-white ring-1 ring-black/[0.05]">
        <div className="aspect-[4/5] w-full animate-pulse bg-neutral-100" />
        <div className="space-y-2 p-3">
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-neutral-100" />
          <div className="h-3 w-1/2 animate-pulse rounded-full bg-neutral-100" />
          <div className="h-3 w-1/3 animate-pulse rounded-full bg-neutral-100" />
        </div>
      </div>
    </li>
  );
}
