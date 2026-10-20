'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, ChevronDown, ChevronUp, Clock, Eye, Heart, LayoutGrid, ListChecks, MapPin, Phone, Play, Star, Tag, Video, X } from '@/lib/icons';
import { RateCard } from '@/components/rates/RateCard';
import { ServiceChips } from '@/components/services/ServiceChips';
import { PhotoWatermark } from '@/components/media/PhotoWatermark';
import { formatRecency } from '@/lib/utils/recency';
import { formatCompactCount, formatCompactPrice } from '@/lib/utils/helpers';
import { getConnectionFeeNgn } from '@/lib/settings/platformSettings';
import { getMockReviews, type MockReview } from '@/lib/map/mockReviews';
import { createClient } from '@/lib/supabase/client';
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

type SheetTab = 'posts' | 'services' | 'rates' | 'reviews';

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
  // Why a call cannot start, shown in place when a dimmed call button
  // is tapped. A hard-disabled button explains nothing on a phone.
  const [callNote, setCallNote] = useState<string | null>(null);
  const callNoteTimer = useRef<number | null>(null);
  const flashCallNote = (msg: string) => {
    setCallNote(msg);
    if (callNoteTimer.current) window.clearTimeout(callNoteTimer.current);
    callNoteTimer.current = window.setTimeout(() => setCallNote(null), 3000);
  };
  const [activeTab, setActiveTab] = useState<SheetTab>('posts');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [reviews, setReviews] = useState<MockReview[]>([]);
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

  // Reset tab and slide when switching providers.
  useEffect(() => {
    setActiveTab('posts');
    setPhotoIndex(0);
    carouselRef.current?.scrollTo({ top: 0 });
  }, [provider?.id]);

/** Self-contained video slide: plays when active, pauses otherwise. */
function VideoSlide({ src, active }: { src: string; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [keyframe, setKeyframe] = useState<string | null>(null);

  // Capture a keyframe from the video itself for the thumbnail.
  // Seeks past the opening (often black) to grab a representative frame.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let done = false;

    const capture = () => {
      if (done) return;
      try {
        v.currentTime = Math.min(1.5, (v.duration || 2) / 2);
      } catch {
        /* seek is best-effort */
      }
    };
    const onSeeked = () => {
      if (done) return;
      done = true;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth || 640;
        canvas.height = v.videoHeight || 360;
        canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height);
        setKeyframe(canvas.toDataURL('image/jpeg', 0.7));
        try {
          v.currentTime = 0;
        } catch {
          /* reset is best-effort */
        }
      } catch {
        /* CORS-tainted canvas: fall back to the video's own first frame */
      }
    };

    v.addEventListener('loadeddata', capture);
    v.addEventListener('seeked', onSeeked);
    return () => {
      v.removeEventListener('loadeddata', capture);
      v.removeEventListener('seeked', onSeeked);
    };
  }, [src]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    try {
      if (active) {
        const p = v.play();
        if (p && typeof p.catch === 'function') {
          p.then(() => setPlaying(true)).catch(() => setPlaying(false));
        }
      } else {
        v.pause();
        setPlaying(false);
      }
    } catch {
      setPlaying(false);
    }
  }, [active]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    try {
      if (v.paused) {
        const p = v.play();
        if (p && typeof p.catch === 'function') {
          p.then(() => setPlaying(true)).catch(() => setPlaying(false));
        }
      } else {
        v.pause();
        setPlaying(false);
      }
    } catch {
      /* tap is best-effort */
    }
  };

  return (
    <div className="relative h-full w-full" onClick={toggle}>
      <video
        ref={ref}
        src={src}
        crossOrigin="anonymous"
        className="h-full w-full object-cover"
        muted
        loop
        playsInline
        preload="auto"
      />
      {/* Keyframe thumbnail + big play button until it plays */}
      {!playing && (
        <div className="absolute inset-0">
          {keyframe ? (
            <img src={keyframe} alt="Video thumbnail" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="h-full w-full bg-neutral-900" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/25">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-xl active:scale-95">
              <Play className="ml-1 h-7 w-7 fill-charcoal text-charcoal" />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

  // Favorites: heart toggle, persisted per user.
  const [isFav, setIsFav] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  useEffect(() => {
    if (!provider) return;
    setIsFav(false);
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !provider.userId) return;
        const { data } = await supabase.from('favorites')
          .select('id').eq('user_id', user.id).eq('provider_id', provider.userId).maybeSingle();
        setIsFav(!!data);
      } catch { /* guests see unfilled heart */ }
    })();
  }, [provider?.id]);

  const toggleFav = async () => {
    if (!provider?.userId || favBusy) return;
    setFavBusy(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/signup?next=/';
        return;
      }
      if (isFav) {
        await supabase.from('favorites')
          .delete().eq('user_id', user.id).eq('provider_id', provider.userId);
        setIsFav(false);
      } else {
        await supabase.from('favorites')
          .insert({ user_id: user.id, provider_id: provider.userId });
        setIsFav(true);
      }
    } catch { /* best-effort */ }
    setFavBusy(false);
  };

  // Load reviews: real rows for DB providers, deterministic mocks for previews.
  // Also bumps the view counter best-effort (traction stat).
  useEffect(() => {
    if (!provider) return;
    let live = true;
    (async () => {
      // Mock/preview pins use deterministic mock reviews.
      if (!provider.userId) {
        if (live) setReviews(getMockReviews(provider.id, provider.reviewCount));
        return;
      }
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('reviews')
          .select('id, rating, comment, created_at')
          .eq('provider_id', provider.userId)
          .order('created_at', { ascending: false })
          .limit(10);
        if (!live) return;
        if (data && data.length > 0) {
          setReviews(
            data.map((r: any) => ({
              id: r.id,
              author: 'Verified client',
              rating: r.rating,
              comment: r.comment ?? '',
              date: new Date(r.created_at).toLocaleDateString('en-NG', {
                day: 'numeric',
                month: 'short',
              }),
            })),
          );
        } else {
          setReviews(getMockReviews(provider.id, provider.reviewCount));
        }
      } catch {
        if (live) setReviews(getMockReviews(provider.id, provider.reviewCount));
      }
      // Best-effort view bump. Fails silently for guests (RLS).
      try {
        const supabase = createClient();
        await supabase.rpc('bump_profile_view', { pid: provider.userId });
      } catch {
        /* traction is best-effort */
      }
    })();
    return () => {
      live = false;
    };
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
  const videos = (provider.videos ?? []).filter(Boolean);
  const totalPhotos = photos.length;
  /** Combined slides: photos first, then videos. */
  const slides: Array<{ kind: 'photo' | 'video'; src: string }> = [
    ...photos.map((src) => ({ kind: 'photo' as const, src })),
    ...videos.map((src) => ({ kind: 'video' as const, src })),
  ];
  const totalSlides = slides.length;

  const scrollToSlide = (index: number) => {
    const clamped = Math.max(0, Math.min(index, totalSlides - 1));
    setPhotoIndex(clamped);
    const el = carouselRef.current;
    if (el) {
      el.scrollTo({ top: clamped * el.clientHeight, behavior: 'smooth' });
    }
  };

  const handleScroll = () => {
    const el = carouselRef.current;
    if (!el || el.clientHeight === 0) return;
    const index = Math.round(el.scrollTop / el.clientHeight);
    if (index !== photoIndex) setPhotoIndex(index);
  };

  // TikTok-style: each video manages its own playback based on `active`.
  // No shared ref array, no indexing across renders.

  return (
    <>
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Bottom sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[92dvh] flex-col rounded-t-[28px] bg-white shadow-sheet animate-sheet-up sm:mx-auto sm:max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-label={`${provider.displayName} profile`}
      >
        {/* Drag handle + close */}
        <div className="relative shrink-0 pt-2">
          <div className="mx-auto h-1.5 w-14 rounded-full bg-neutral-200/90" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-black/5 text-neutral-600 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {/* TikTok-style profile header: avatar + stats */}
          <div className="px-4 pt-3">
            <div className="flex items-center gap-4">
              <div
                className="shrink-0 rounded-full p-[2.5px]"
                style={{
                  background: provider.trustTier === 'elite'
                    ? 'linear-gradient(135deg, #E8D49E 0%, #C9A84C 45%, #9A7A2E 100%)'
                    : provider.verified
                      ? 'linear-gradient(135deg, #D43A6B 0%, #AC244D 60%, #7A1A36 100%)'
                      : 'transparent',
                }}
              >
                <img
                  src={provider.avatar}
                  alt={provider.displayName}
                  className="h-20 w-20 rounded-full border-2 border-white object-cover shadow-md"
                />
              </div>
              <div className="flex flex-1 items-center">
                <div className="flex-1 text-center">
                  <p className="font-display text-[22px] font-semibold text-charcoal">{formatCompactCount(provider.viewCount)}</p>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Views</p>
                </div>
                <div className="h-9 w-px bg-neutral-100" />
                <div className="flex-1 text-center">
                  <p className="font-display text-[22px] font-semibold text-charcoal">{formatCompactCount(provider.bookingCount)}</p>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Bookings</p>
                </div>
                <div className="h-9 w-px bg-neutral-100" />
                <div className="flex-1 text-center">
                  <p className="font-display text-[22px] font-semibold text-charcoal">
                    {provider.rating !== null ? provider.rating.toFixed(1) : '-'}
                  </p>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Rating ({provider.reviewCount})</p>
                </div>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-1.5">
              <h2 className="font-display text-lg font-semibold text-charcoal">{nameLine}</h2>
              {provider.verified && <BadgeCheck className="h-4 w-4 text-primary" />}
            </div>
            <p className="flex items-center gap-1 text-sm text-neutral-500">
              <MapPin className="h-3.5 w-3.5" />
              {provider.area}, {provider.city}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {provider.available && (
                <span className="flex items-center gap-1 font-medium text-green-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                  Available now
                </span>
              )}
              {recency && (
                <span className="text-neutral-500">{recency}</span>
              )}
              <span className="text-neutral-500">
                {provider.ratesNegotiable ? 'Negotiable' : 'Fixed rates'}
              </span>
            </div>

            {/* Action row: request + calls + favorite (wraps on narrow phones) */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => onRequestConnection(provider)}
                className="btn-luxe h-11 min-w-[218px] flex-1 gap-1.5 whitespace-nowrap px-4 text-[15px]"
              >
                Request connection
                {connectionFee !== null && (
                  <span className="shrink-0 text-[13px] font-normal text-white/85">• ₦{connectionFee.toLocaleString()}</span>
                )}
              </button>
              <button
                onClick={() => { if (!offersVoice) { flashCallNote(voiceNote); return } onVoiceCall(provider) }}
                title={voiceNote}
                aria-label={voiceNote}
                className={"flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-soft ring-1 ring-black/[0.06] transition-all active:scale-90" + (voiceDisabled ? " opacity-40 shadow-none" : "")}
              >
                <Phone className="h-4 w-4 text-charcoal" />
              </button>
              <button
                onClick={() => { if (!offersVideo) { flashCallNote(videoNote); return } onVideoCall(provider) }}
                title={videoNote}
                aria-label={videoNote}
                className={"flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-soft ring-1 ring-black/[0.06] transition-all active:scale-90" + (videoDisabled ? " opacity-40 shadow-none" : "")}
              >
                <Video className="h-4 w-4 text-charcoal" />
              </button>
              <button
                onClick={toggleFav}
                disabled={favBusy}
                aria-label={isFav ? 'Remove from favorites' : 'Save to favorites'}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-soft ring-1 ring-black/[0.06] active:scale-90"
              >
                <Heart className={'h-4 w-4 ' + (isFav ? 'fill-primary text-primary' : 'text-neutral-400')} />
              </button>
            </div>
          </div>

          {callNote && (
            <p className="mt-2 text-center text-[13px] font-medium text-neutral-500">{callNote}</p>
          )}

          {/* TikTok-style tab bar: icons */}
          <div className="mt-3 flex border-b border-neutral-100">
            {(
              [
                { value: 'posts', icon: LayoutGrid, label: 'Posts' },
                { value: 'services', icon: ListChecks, label: 'Services' },
                { value: 'rates', icon: Tag, label: 'Rates' },
                { value: 'reviews', icon: Star, label: 'Reviews' },
              ] as const
            ).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                aria-label={label}
                className={`relative flex flex-1 items-center justify-center py-2.5 transition-colors ${
                  activeTab === value ? 'text-charcoal' : 'text-neutral-300'
                }`}
              >
                <Icon className="h-5 w-5" />
                {activeTab === value && (
                  <span className="absolute inset-x-10 bottom-0 h-0.5 rounded-full bg-charcoal" />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="px-4 py-3">
            {activeTab === 'posts' && (
              <div className="grid grid-cols-3 gap-1">
                {slides.map((slide, i) => (
                  <button
                    key={i}
                    onClick={() => setLightbox(i)}
                    className="relative aspect-[3/4] overflow-hidden bg-neutral-100"
                  >
                    {slide.kind === 'photo' ? (
                      <img
                        src={slide.src}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <VideoSlide src={slide.src} active={false} />
                    )}
                    <span className="absolute bottom-1 left-1 flex items-center gap-0.5 text-[10px] font-semibold text-white drop-shadow">
                      <Play className="h-2.5 w-2.5 fill-white" />
                      {formatCompactCount(Math.max(1, Math.round(provider.viewCount / Math.max(1, totalSlides))))}
                    </span>
                    {slide.kind === 'video' && (
                      <span className="absolute right-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[9px] font-medium text-white">
                        VIDEO
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
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
            {activeTab === 'reviews' && (
              <div className="space-y-3">
                {reviews.length === 0 ? (
                  <p className="py-4 text-center text-sm text-neutral-400">
                    No reviews yet. Be the first to book and review.
                  </p>
                ) : (
                  reviews.map((r) => (
                    <div key={r.id} className="rounded-2xl bg-cream p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-charcoal">{r.author}</span>
                        <span className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`h-3 w-3 ${
                                s <= r.rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-neutral-300'
                              }`}
                            />
                          ))}
                        </span>
                      </div>
                      {r.comment && (
                        <p className="mt-1 text-sm text-neutral-600">{r.comment}</p>
                      )}
                      <p className="mt-1 text-xs text-neutral-400">{r.date}</p>
                    </div>
                  ))
                )}
              </div>
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

      </div>

      {/* Lightbox: fullscreen viewer for grid taps */}
      {lightbox !== null && slides[lightbox] && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95"
          onClick={() => setLightbox(null)}
        >
          <button
            aria-label="Close"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="max-h-full w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
            {slides[lightbox].kind === 'photo' ? (
              <img
                src={slides[lightbox].src}
                alt=""
                className="max-h-[80vh] w-full rounded-2xl object-contain"
                draggable={false}
              />
            ) : (
              <VideoSlide src={slides[lightbox].src} active={true} />
            )}
          </div>
          {totalSlides > 1 && (
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + totalSlides) % totalSlides); }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
                aria-label="Previous"
              >
                <ChevronUp className="h-5 w-5 -rotate-90" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % totalSlides); }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
                aria-label="Next"
              >
                <ChevronUp className="h-5 w-5 rotate-90" />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
