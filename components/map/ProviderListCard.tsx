'use client';

import { BadgeCheck, ChevronRight, MapPin } from 'lucide-react';
import { formatPrice } from '@/lib/utils/helpers';
import { ServiceChips } from '@/components/services/ServiceChips';
import type { MapProvider } from '@/lib/map/providers';

interface ProviderListCardProps {
  provider: MapProvider;
  onSelect: (provider: MapProvider) => void;
}

/**
 * First-class list card: photo, name with verified check, area, short-time
 * rate, a preview of service offerings, and availability. Tapping opens the
 * same bottom sheet as a map pin, so selection stays synced across views.
 */
export function ProviderListCard({ provider, onSelect }: ProviderListCardProps) {
  const nameLine =
    provider.age !== null ? `${provider.displayName}, ${provider.age}` : provider.displayName;

  return (
    <li>
      <button
        onClick={() => onSelect(provider)}
        className="group flex w-full items-center gap-3.5 rounded-3xl bg-white p-3 text-left shadow-[0_2px_16px_rgba(26,26,26,0.07)] ring-1 ring-black/[0.04] transition-all duration-150 active:scale-[0.98]"
      >
        <img
          src={provider.avatar}
          alt={provider.displayName}
          loading="lazy"
          className="h-24 w-24 shrink-0 rounded-2xl object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-display text-[17px] font-semibold text-charcoal">
            <span className="truncate">{nameLine}</span>
            {provider.verified && (
              <BadgeCheck className="h-4 w-4 shrink-0 fill-[#AC244D] text-white" />
            )}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
            <MapPin className="h-3 w-3" />
            {provider.area}, {provider.city}
          </p>
          {provider.rateShortTime !== null ? (
            <p className="mt-1 text-sm font-bold text-[#AC244D]">
              {formatPrice(provider.rateShortTime)}{' '}
              <span className="font-medium text-neutral-400">short time</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-neutral-400">Rates not listed yet</p>
          )}
          <div className="mt-1.5">
            <ServiceChips services={provider.services} previewLimit={3} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between self-stretch py-1">
          {provider.available ? (
            <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-1 text-[11px] font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Available
            </span>
          ) : (
            <span />
          )}
          <ChevronRight className="h-5 w-5 text-neutral-300 transition-transform group-active:translate-x-0.5" />
        </div>
      </button>
    </li>
  );
}

/** Shimmer placeholder while providers load in list view. */
export function ProviderListSkeleton() {
  return (
    <li aria-hidden="true">
      <div className="flex gap-3.5 rounded-3xl bg-white p-3 ring-1 ring-black/[0.04]">
        <div className="h-24 w-24 shrink-0 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="flex-1 space-y-2.5 py-1.5">
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-neutral-100" />
          <div className="h-3 w-1/2 animate-pulse rounded-full bg-neutral-100" />
          <div className="h-3 w-1/3 animate-pulse rounded-full bg-neutral-100" />
          <div className="flex gap-1.5 pt-1">
            <div className="h-5 w-16 animate-pulse rounded-full bg-neutral-100" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-neutral-100" />
          </div>
        </div>
      </div>
    </li>
  );
}
