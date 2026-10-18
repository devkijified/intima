'use client';

import { BadgeCheck, MapPin, Phone, Star, Video, X } from 'lucide-react';
import { formatPrice } from '@/lib/utils/helpers';
import type { MockProvider } from '@/lib/map/mockProviders';

interface ProviderSheetProps {
  provider: MockProvider | null;
  onClose: () => void;
  onViewProfile: (provider: MockProvider) => void;
  onVoiceCall: (provider: MockProvider) => void;
  onVideoCall: (provider: MockProvider) => void;
}

const UNAVAILABLE_COPY = 'Available after verification launch';

export function ProviderSheet({
  provider,
  onClose,
  onViewProfile,
  onVoiceCall,
  onVideoCall,
}: ProviderSheetProps) {
  if (!provider) return null;

  const callsEnabled = provider.userId !== null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-3 sm:px-6 sm:pb-6">
      <div className="mx-auto max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="relative">
          <img
            src={provider.avatar}
            alt={provider.displayName}
            className="h-36 w-full object-cover"
          />
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
          >
            <X className="h-4 w-4" />
          </button>
          {provider.available && (
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-green-500/95 px-3 py-1 text-xs font-medium text-white shadow-lg">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              Available now
            </span>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 text-lg font-bold text-charcoal">
                <span className="truncate">
                  {provider.displayName}, {provider.age}
                </span>
                {provider.verified && (
                  <BadgeCheck className="h-5 w-5 shrink-0 fill-[#AC244D] text-white" />
                )}
              </h3>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-neutral-500">
                <MapPin className="h-3.5 w-3.5" />
                {provider.area}, {provider.city}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-secondary-muted px-2.5 py-1">
              <Star className="h-3.5 w-3.5 fill-secondary text-secondary" />
              <span className="text-sm font-semibold">{provider.rating.toFixed(1)}</span>
              <span className="text-xs text-neutral-500">({provider.reviewCount})</span>
            </div>
          </div>

          <p className="mt-2 text-sm text-neutral-500">
            {formatPrice(provider.ratePerHour)}
            <span className="text-xs"> per hour</span>
            <span className="mx-2 text-neutral-300">|</span>
            <span className="text-xs">Area location only, never an exact address</span>
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              onClick={() => onViewProfile(provider)}
              className="rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              View profile
            </button>
            <button
              onClick={() => onVoiceCall(provider)}
              disabled={!callsEnabled}
              title={callsEnabled ? 'Start a voice call' : UNAVAILABLE_COPY}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-medium text-charcoal transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-charcoal"
            >
              <Phone className="h-4 w-4" />
              Voice
            </button>
            <button
              onClick={() => onVideoCall(provider)}
              disabled={!callsEnabled}
              title={callsEnabled ? 'Start a video call' : UNAVAILABLE_COPY}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-medium text-charcoal transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-charcoal"
            >
              <Video className="h-4 w-4" />
              Video
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
