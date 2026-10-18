'use client';

import { BadgeCheck, MapPin, Phone, Star, Video, X } from 'lucide-react';
import { formatPrice } from '@/lib/utils/helpers';
import type { MapProvider } from '@/lib/map/providers';

interface ProviderSheetProps {
  provider: MapProvider | null;
  onClose: () => void;
  onViewProfile: (provider: MapProvider) => void;
  onRequestConnection: (provider: MapProvider) => void;
  onVoiceCall: (provider: MapProvider) => void;
  onVideoCall: (provider: MapProvider) => void;
  /** True when the call buttons must render disabled (logged in, preview pin). */
  callsDisabled: boolean;
  callsDisabledNote: string;
  /** Show the "View full profile" link (only for real provider rows). */
  showViewProfile: boolean;
}

export function ProviderSheet({
  provider,
  onClose,
  onViewProfile,
  onRequestConnection,
  onVoiceCall,
  onVideoCall,
  callsDisabled,
  callsDisabledNote,
  showViewProfile,
}: ProviderSheetProps) {
  if (!provider) return null;

  const nameLine =
    provider.age !== null ? `${provider.displayName}, ${provider.age}` : provider.displayName;

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-6 sm:pb-6">
      <div className="mx-auto max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5">
        {/* Prominent photo: fully visible, no blur, no cover overlays. */}
        <div className="relative">
          <img
            src={provider.avatar}
            alt={provider.displayName}
            className="h-56 w-full object-cover"
            loading="lazy"
          />
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
          >
            <X className="h-4 w-4" />
          </button>
          {provider.verified && (
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[#AC244D] px-3 py-1 text-xs font-semibold text-white shadow-lg">
              <BadgeCheck className="h-3.5 w-3.5" />
              Verified
            </span>
          )}
          {provider.available && (
            <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-green-500/95 px-3 py-1 text-xs font-medium text-white shadow-lg">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              Available now
            </span>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 text-lg font-bold text-charcoal">
                <span className="truncate">{nameLine}</span>
                {provider.verified && (
                  <BadgeCheck className="h-5 w-5 shrink-0 fill-[#AC244D] text-white" />
                )}
              </h3>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-neutral-500">
                <MapPin className="h-3.5 w-3.5" />
                {provider.area}, {provider.city}
              </p>
            </div>
            {provider.rating !== null && (
              <div className="flex shrink-0 items-center gap-1 rounded-full bg-secondary-muted px-2.5 py-1">
                <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
                <span className="text-sm font-semibold">{provider.rating.toFixed(1)}</span>
                <span className="text-xs text-neutral-500">({provider.reviewCount})</span>
              </div>
            )}
          </div>

          <p className="mt-2 text-sm text-neutral-500">
            {provider.ratePerHour !== null ? (
              <>
                {formatPrice(provider.ratePerHour)}
                <span className="text-xs"> per hour</span>
              </>
            ) : (
              <span className="text-xs">Rate on request</span>
            )}
            <span className="mx-2 text-neutral-300">|</span>
            <span className="text-xs">Area location only, never an exact address</span>
          </p>

          {/* Primary CTA: see, then order. */}
          <button
            onClick={() => onRequestConnection(provider)}
            className="mt-4 w-full rounded-2xl bg-primary py-3.5 text-base font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Request connection
          </button>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => onVoiceCall(provider)}
              disabled={callsDisabled}
              title={callsDisabled ? callsDisabledNote : 'Start a voice call'}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-medium text-charcoal transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-charcoal"
            >
              <Phone className="h-4 w-4" />
              Voice call
            </button>
            <button
              onClick={() => onVideoCall(provider)}
              disabled={callsDisabled}
              title={callsDisabled ? callsDisabledNote : 'Start a video call'}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-medium text-charcoal transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-charcoal"
            >
              <Video className="h-4 w-4" />
              Video call
            </button>
          </div>

          {showViewProfile && (
            <button
              onClick={() => onViewProfile(provider)}
              className="mt-3 w-full text-center text-sm font-medium text-primary hover:underline"
            >
              View full profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
