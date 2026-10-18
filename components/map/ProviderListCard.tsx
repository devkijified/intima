'use client';

import { BadgeCheck, MapPin } from 'lucide-react';
import { formatPrice } from '@/lib/utils/helpers';
import { ServiceChips } from '@/components/services/ServiceChips';
import type { MapProvider } from '@/lib/map/providers';

interface ProviderListCardProps {
  provider: MapProvider;
  onSelect: (provider: MapProvider) => void;
}

/**
 * Vertical provider card for the grid list view: photo on top with
 * verified/available overlays, then name, area, rate and a service
 * preview. Tapping opens the same bottom sheet as a map pin, so
 * selection stays synced across views.
 */
export function ProviderListCard({ provider, onSelect }: ProviderListCardProps) {
  const nameLine =
    provider.age !== null ? `${provider.displayName}, ${provider.age}` : provider.displayName;

  return (
    <li>
      <button
        onClick={() => onSelect(provider)}
        className="group flex w-full flex-col overflow-hidden rounded-3xl bg-white text-left ring-1 ring-black/[0.04] transition-all duration-150 active:scale-[0.98]"
        style={{ boxShadow: '0 2px 16px rgba(26,26,26,0.07)' }}
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-100">
          <img
            src={provider.avatar}
            alt={provider.displayName}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-active:scale-105"
          />
          {provider.verified && (
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-[#AC244D] px-2 py-1 text-[10px] font-semibold text-white">
              <BadgeCheck className="h-3 w-3" />
              Verified
            </span>
          )}
          {provider.available && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              Available
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-3">
          <p className="truncate font-display text-[15px] font-semibold tracking-tight text-charcoal">
            {nameLine}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-neutral-500">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {provider.area}, {provider.city}
            </span>
          </p>
          {provider.rateShortTime !== null ? (
            <p className="mt-1.5 text-[13px] font-bold text-[#AC244D]">
              {formatPrice(provider.rateShortTime)}{' '}
              <span className="font-medium text-neutral-400">short time</span>
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-neutral-400">Rates not listed yet</p>
          )}
          <div className="mt-2">
            <ServiceChips services={provider.services} previewLimit={2} />
          </div>
        </div>
      </button>
    </li>
  );
}

/** Shimmer placeholder matching the card shape while providers load. */
export function ProviderListSkeleton() {
  return (
    <li aria-hidden="true">
      <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-black/[0.04]">
        <div className="aspect-[3/4] w-full animate-pulse bg-neutral-100" />
        <div className="space-y-2 p-3">
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-neutral-100" />
          <div className="h-3 w-1/2 animate-pulse rounded-full bg-neutral-100" />
          <div className="h-3 w-1/3 animate-pulse rounded-full bg-neutral-100" />
        </div>
      </div>
    </li>
  );
}
