'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, ChevronLeft, ChevronRight, Clock, MapPin, Phone, Star, Video, X } from 'lucide-react';
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

type SheetTab = 'services' | 'rates';

/**
 * Instagram-style provider sheet: swipeable gallery preview on top,
 * profile header with stats, tabbed content below. The gallery is the
 * hero, not buried, users swipe through photos like a preview.
 */
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
  const [activeTab, setActiveTab] = useState<SheetTab>('services');
  const [photoIndex, setPhotoIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    getConnectionFeeNgn().then((fee) => {
      if (live) setConnectionFee(fee);
    });
    return () => {
      live = false;
    };
  }, []);

  // Reset tab and photo when switching providers.
  useEffect(() => {
    setActiveTab('services');
    setPhotoIndex(0);
    carouselRef.current?.scrollTo({ left: 0 });
  }, [provider?.id]);

  if (!provider) return null;

  const nameLine =
    provider.age !== null ? `${provider.displayName}, ${provider.age}` : provider.displayName;
  const recency = formatRecency(provider.lastActiveAt);
  const offersVoice = provider.services.includes('voice-call');
  const offersVideo = provider.services.includes('video-call');
  const voiceDisabled = callsDisabled || !offersVoice;
  const videoDisabled = callsDisabled || !offersVideo;
  const voiceNote = callsDisabled ? callsDisabledNote : !offersVoice ? 'She doesn\u2019t offer voice calls' : 'Start a voice call';
  const videoNote = callsDisabled ? callsDisabledNote : !offersVideo ? 'She doesn\u2019t offer video calls' : 'Start a video call';

  // Gallery: avatar is the cover, gallery_urls are the rest.
  const photos = [provider.avatar, ...provider.gallery].filter(Boolean);
  const totalPhotos = photos.length;

  const scrollToPhoto = (index: number) => {
    const clamped = Math.max(0, Math.min(index, totalPhotos - 1));
    setPhotoIndex(clamped);
    const el = carouselRef.current;
    if (el) {
      el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
    }
  };

  const handleScroll = () => {
    const el = carouselRef.current;
    if (!el || el.clientWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== photoIndex) setPhotoIndex(index);
  };

  return (
    <>
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/60 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Bottom sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[92dvh] flex-col rounded-t-3xl bg-white shadow-2xl animate-sheet-up sm:mx-auto sm:max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-label={`${provider.displayName} profile`}
      >
        {/* Drag handle + close */}
        <div className="relative shrink-0 pt-2">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-neutral-200" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-neutral-600 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Gallery preview: swipeable carousel, Instagram-style */}
          <div className="relative">
            <div
              ref={carouselRef}
              onScroll={handleScroll}
              className="flex snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {photos.map((src, i) => (
                <div key={i} className="relative w-full shrink-0 snap-center">
                  <img
                    src={src}
                    alt={`${provider.displayName} photo ${i + 1}`}
                    className="aspect-[4/3] w-full object-cover"
                    draggable={false}
                  />
                  <PhotoWatermark />
                </div>
              ))}
            </div>
            {/* Photo counter + arrows */}
            {totalPhotos > 1 && (
              <>
                <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  {photoIndex + 1} / {totalPhotos}
                </span>
                <button
                  onClick={() => scrollToPhoto(photoIndex - 1)}
                  aria-label="Previous photo"
                  className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm active:scale-95"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => scrollToPhoto(photoIndex + 1)}
                  aria-label="Next photo"
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm active:scale-95"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                {/* Dots */}
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                  {photos.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => scrollToPhoto(i)}
                      aria-label={`Go to photo ${i + 1}`}
                      className={`h-1.5 rounded-full transition-all ${
                        i === photoIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
            {/* Available pill overlaid */}
            {provider.available && (
              <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-green-500/95 px-3 py-1 text-xs font-medium text-white shadow-lg">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                Available now
              </span>
            )}
          </div>

          {/* Profile header: name, verified, stats */}
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl font-semibold text-charcoal">{nameLine}</h2>
              {provider.verified && (
                <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Verified
                </span>
              )}
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-neutral-500">
              <MapPin className="h-3.5 w-3.5" />
              {provider.area}, {provider.city}
            </p>
            {/* Stats row: rating, recency, negotiable */}
            <div className="mt-2 flex items-center gap-4 text-sm">
              {provider.rating !== null && (
                <span className="flex items-center gap-1 font-semibold text-charcoal">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {provider.rating.toFixed(1)}
                  <span className="font-normal text-neutral-500">({provider.reviewCount})</span>
                </span>
              )}
              {recency && (
                <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                  <Clock className="h-3 w-3" />
                  {recency}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-neutral-500">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    provider.ratesNegotiable ? 'bg-green-500' : 'bg-neutral-400'
                  }`}
                />
                {provider.ratesNegotiable ? 'Negotiable' : 'Fixed rates'}
              </span>
            </div>
          </div>

          {/* Tab bar: Instagram-style */}
          <div className="mt-3 flex border-b border-neutral-100 px-4">
            {(
              [
                { value: 'services', label: 'Services' },
                { value: 'rates', label: 'Rates' },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                className={`relative flex-1 py-2.5 text-sm font-semibold transition-colors ${
                  activeTab === value ? 'text-charcoal' : 'text-neutral-400'
                }`}
              >
                {label}
                {activeTab === value && (
                  <span className="absolute inset-x-8 bottom-0 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="px-4 py-3">
            {activeTab === 'services' && (
              <ServiceChips services={provider.services} />
            )}
            {activeTab === 'rates' && (
              <RateCard
                rates={{
                  shortTime: provider.rateShortTime,
                  overnight: provider.rateOvernight,
                  weekend: provider.rateWeekend,
                }}
              />
            )}
          </div>

          <p className="px-4 pb-2 text-xs text-neutral-500">
            Area location only, never an exact address
          </p>

          {showViewProfile && (
            <button
              onClick={() => onViewProfile(provider)}
              className="w-full py-2 text-center text-sm font-medium text-primary hover:underline"
            >
              View full profile
            </button>
          )}
          {/* Spacer so content clears the sticky footer */}
          <div className="h-2" />
        </div>

        {/* Sticky action footer */}
        <div className="shrink-0 border-t border-neutral-100 bg-white/95 p-3 backdrop-blur">
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
    </>
  );
}
