'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, Clock, MapPin, Phone, Star, Video, X } from 'lucide-react';
import { RateCard } from '@/components/rates/RateCard';
import { ServiceChips } from '@/components/services/ServiceChips';
import { PhotoWatermark } from '@/components/media/PhotoWatermark';
import { formatRecency } from '@/lib/utils/recency';
import { formatCompactPrice } from '@/lib/utils/helpers';
import { getConnectionFeeNgn } from '@/lib/settings/platformSettings';
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
  const [connectionFee, setConnectionFee] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    getConnectionFeeNgn().then((fee) => {
      if (live) setConnectionFee(fee);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!provider) return null;

  const nameLine =
    provider.age !== null ? `${provider.displayName}, ${provider.age}` : provider.displayName;
  const recency = formatRecency(provider.lastActiveAt);
  /** Call buttons reflect what she actually offers. If she hasn't listed
      a call service, the button is disabled with an honest note. */
  const offersVoice = provider.services.includes('voice-call');
  const offersVideo = provider.services.includes('video-call');
  const voiceDisabled = callsDisabled || !offersVoice;
  const videoDisabled = callsDisabled || !offersVideo;
  const voiceNote = callsDisabled ? callsDisabledNote : !offersVoice ? 'She doesn\u2019t offer voice calls' : 'Start a voice call';
  const videoNote = callsDisabled ? callsDisabledNote : !offersVideo ? 'She doesn\u2019t offer video calls' : 'Start a video call';

  return (
    <>
      {/* Dimmed backdrop: tap anywhere outside to dismiss. */}
      <div
        className="animate-fade-in absolute inset-0 z-30 bg-black/45"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="animate-sheet-up absolute inset-x-0 bottom-0 z-40">
        <div className="mx-auto max-w-md px-3 pb-3 sm:px-6 sm:pb-6">
          <div className="overflow-hidden rounded-[28px] bg-white shadow-2xl">
            {/* Drag handle. */}
            <div className="flex justify-center bg-white pt-2.5">
              <div className="h-1 w-10 rounded-full bg-neutral-300" />
            </div>

            {/* Scrollable content. */}
            <div className="max-h-[58dvh] overflow-y-auto">
              {/* Prominent photo: fully visible, no blur, no cover overlays. */}
              <div className="relative mt-2">
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
                <PhotoWatermark />
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl font-semibold tracking-tight text-charcoal">
                      <span className="truncate">{nameLine}</span>
                    </h3>
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-neutral-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {provider.area}, {provider.city}
                    </p>
                    {recency && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-green-700">
                        <Clock className="h-3 w-3" />
                        {recency}
                      </p>
                    )}
                  </div>
                  {provider.rating !== null && (
                    <div className="flex shrink-0 items-center gap-1 rounded-full bg-[#C9A84C]/15 px-2.5 py-1">
                      <Star className="h-3.5 w-3.5 fill-[#C9A84C] text-[#C9A84C]" />
                      <span className="text-sm font-semibold text-charcoal">
                        {provider.rating.toFixed(1)}
                      </span>
                      <span className="text-xs text-neutral-500">({provider.reviewCount})</span>
                    </div>
                  )}
                </div>

                {/* What she offers: the determiners, grouped by category. */}
                <div className="mt-3 border-t border-[#C9A84C]/25 pt-3">
                  <ServiceChips services={provider.services} />
                </div>

                {/* Rates sit ABOVE the fee CTA: nobody pays the connection fee blind. */}
                <div className="mt-3">
                  <RateCard
                    rates={{
                      shortTime: provider.rateShortTime,
                      overnight: provider.rateOvernight,
                      weekend: provider.rateWeekend,
                    }}
                  />
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-neutral-500">
                    {provider.ratesNegotiable ? (
                      <>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                        Open to offers on rates
                      </>
                    ) : (
                      <>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-400" />
                        Fixed rates, not negotiable
                      </>
                    )}
                  </p>
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Area location only, never an exact address
                </p>

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

            {/* Sticky action footer: the order button is always in reach. */}
            <div className="border-t border-neutral-100 bg-white/95 p-3 backdrop-blur">
              <button
                onClick={() => onRequestConnection(provider)}
                className="w-full rounded-2xl bg-primary py-3.5 text-base font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary-dark active:scale-[0.99]"
              >
                Request connection
                {connectionFee !== null && (
                  <span className="mt-0.5 block text-xs font-normal text-white/85">
                    {formatCompactPrice(connectionFee)} connection fee
                  </span>
                )}
              </button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => onVoiceCall(provider)}
                  disabled={voiceDisabled}
                  title={voiceNote}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-medium text-charcoal transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-charcoal"
                >
                  <Phone className="h-4 w-4" />
                  Voice call
                </button>
                <button
                  onClick={() => onVideoCall(provider)}
                  disabled={videoDisabled}
                  title={videoNote}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-medium text-charcoal transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-charcoal"
                >
                  <Video className="h-4 w-4" />
                  Video call
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
