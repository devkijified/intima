'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, BadgeCheck, ChevronUp, Heart, LayoutGrid, ListChecks,
  MapPin, Phone, Play, Star, Tag, Video, X,
} from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { RateCard } from '@/components/rates/RateCard'
import { ServiceChips } from '@/components/services/ServiceChips'
import { formatRecency } from '@/lib/utils/recency'
import { formatCompactCount } from '@/lib/utils/helpers'
import { getConnectionFeeNgn } from '@/lib/settings/platformSettings'
import { useCall } from '@/components/calls/CallProvider'
import { RequestConnectionModal } from '@/components/connections/RequestConnectionModal'
import { StoryViewer, type Story } from '@/components/stories/StoryViewer'
import type { MockReview } from '@/lib/map/mockReviews'

type PageTab = 'posts' | 'services' | 'rates' | 'reviews'

interface Provider {
  id: string
  username: string | null
  bio: string | null
  displayName: string
  avatar: string | null
  verified: boolean
  city: string
  area: string
  available: boolean
  rating: number | null
  reviewCount: number
  bookingCount: number
  viewCount: number
  rateShortTime: number | null
  rateOvernight: number | null
  rateWeekend: number | null
  services: string[]
  ratesNegotiable: boolean
  gallery: string[]
  videos: string[]
  lastActiveAt: string | null
}

/** Self-contained video slide: keyframe thumbnail until tapped. */
function VideoSlide({ src, active }: { src: string; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [keyframe, setKeyframe] = useState<string | null>(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    let done = false
    const capture = () => {
      if (done) return
      try {
        v.currentTime = Math.min(1.5, (v.duration || 2) / 2)
      } catch { /* best-effort */ }
    }
    const onSeeked = () => {
      if (done) return
      done = true
      try {
        const canvas = document.createElement('canvas')
        canvas.width = v.videoWidth || 640
        canvas.height = v.videoHeight || 360
        canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height)
        setKeyframe(canvas.toDataURL('image/jpeg', 0.7))
        try { v.currentTime = 0 } catch { /* best-effort */ }
      } catch { /* CORS-tainted: fall back to first frame */ }
    }
    v.addEventListener('loadeddata', capture)
    v.addEventListener('seeked', onSeeked)
    return () => {
      v.removeEventListener('loadeddata', capture)
      v.removeEventListener('seeked', onSeeked)
    }
  }, [src])

  useEffect(() => {
    const v = ref.current
    if (!v) return
    try {
      if (active) {
        const p = v.play()
        if (p && typeof p.catch === 'function') {
          p.then(() => setPlaying(true)).catch(() => setPlaying(false))
        }
      } else {
        v.pause()
        setPlaying(false)
      }
    } catch {
      setPlaying(false)
    }
  }, [active])

  const toggle = () => {
    const v = ref.current
    if (!v) return
    try {
      if (v.paused) {
        const p = v.play()
        if (p && typeof p.catch === 'function') {
          p.then(() => setPlaying(true)).catch(() => setPlaying(false))
        }
      } else {
        v.pause()
        setPlaying(false)
      }
    } catch { /* best-effort */ }
  }

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
      {!playing && (
        <div className="absolute inset-0">
          {keyframe ? (
            <img src={keyframe} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="h-full w-full bg-neutral-900" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/25">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-xl active:scale-95">
              <Play className="ml-0.5 h-5 w-5 fill-charcoal text-charcoal" />
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ModelDetailPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { startCall } = useCall()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setLoggedIn(!!user))
  }, [supabase])

  const [provider, setProvider] = useState<Provider | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<PageTab>('posts')
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [reviews, setReviews] = useState<MockReview[]>([])
  const [connectionFee, setConnectionFee] = useState<number | null>(null)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [connected, setConnected] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3200)
  }

  // Favorites.
  const [isFav, setIsFav] = useState(false)
  const [favBusy, setFavBusy] = useState(false)

  // Stories + live.
  const [stories, setStories] = useState<Story[]>([])
  const [showStories, setShowStories] = useState(false)
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getConnectionFeeNgn().then((fee) => {
      if (live) setConnectionFee(fee)
    })
    return () => { live = false }
  }, [])

  useEffect(() => {
    let live = true
    ;(async () => {
      const slug = params.slug
      if (!slug) { setNotFound(true); setLoading(false); return }

      // Provider row: username first (shareable /companion/adaeze),
      // then raw id as fallback.
      const base = () => supabase
        .from('profiles')
        .select('id, username, bio, display_name, avatar_url, is_verified, rate_short_time_ngn, rate_overnight_ngn, rate_weekend_ngn, services, rates_negotiable, gallery_urls, video_urls, view_count')
        .eq('role', 'model')
      const { data: byName } = await base().eq('username', slug).maybeSingle()
      const { data: byId } = byName ? { data: null } : await base().eq('id', slug).maybeSingle()
      const p = byName ?? byId
      if (!p) {
        if (live) { setNotFound(true); setLoading(false) }
        return
      }
      const id = p.id

      // Presence: city + availability + recency.
      const { data: presence } = await supabase
        .from('provider_presence')
        .select('city, is_available, updated_at')
        .eq('provider_id', id)
        .maybeSingle()

      // Reviews: count, average, latest rows.
      const { data: reviewRows, count: reviewCount } = await supabase
        .from('reviews')
        .select('id, rating, comment, created_at', { count: 'exact' })
        .eq('provider_id', id)
        .order('created_at', { ascending: false })
        .limit(10)

      // Bookings: active connection count.
      const { count: bookingCount } = await supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', id)
        .eq('status', 'active')

      // Active stories for the story ring.
      const { data: storyRows } = await supabase
        .from('stories')
        .select('id, provider_id, media_url, media_type, caption, created_at')
        .eq('provider_id', id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })

      // Live now?
      const { data: liveRow } = await supabase
        .from('live_sessions')
        .select('id')
        .eq('provider_id', id)
        .eq('status', 'live')
        .maybeSingle()

      // Connected already?
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: conn } = await supabase
          .from('connections')
          .select('id')
          .eq('client_id', user.id)
          .eq('provider_id', id)
          .eq('status', 'active')
          .maybeSingle()
        if (live && conn) setConnected(true)
        const { data: fav } = await supabase
          .from('favorites')
          .select('id')
          .eq('user_id', user.id)
          .eq('provider_id', id)
          .maybeSingle()
        if (live) setIsFav(!!fav)
      }

      if (!live) return

      const ratings = (reviewRows ?? []).map((r) => r.rating).filter((r) => typeof r === 'number')
      const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null

      setProvider({
        id: p.id,
        username: p.username ?? null,
        bio: p.bio ?? null,
        displayName: p.display_name ?? 'Intima companion',
        avatar: p.avatar_url,
        verified: p.is_verified === true,
        city: presence?.city ?? '',
        area: 'Approximate area',
        available: presence?.is_available === true,
        rating: avg,
        reviewCount: reviewCount ?? 0,
        bookingCount: bookingCount ?? 0,
        viewCount: p.view_count ?? 0,
        rateShortTime: p.rate_short_time_ngn,
        rateOvernight: p.rate_overnight_ngn,
        rateWeekend: p.rate_weekend_ngn,
        services: p.services ?? [],
        ratesNegotiable: p.rates_negotiable !== false,
        gallery: p.gallery_urls ?? [],
        videos: p.video_urls ?? [],
        lastActiveAt: presence?.updated_at ?? null,
      })
      setReviews(
        (reviewRows ?? []).map((r) => ({
          id: r.id,
          author: 'Verified client',
          rating: r.rating,
          comment: r.comment ?? '',
          date: new Date(r.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }),
        }))
      )
      setStories(
        (storyRows ?? []).map((s) => ({
          id: s.id,
          provider_id: s.provider_id,
          media_url: s.media_url,
          media_type: s.media_type as 'photo' | 'video',
          caption: s.caption,
          created_at: s.created_at,
          provider_name: p.display_name ?? 'Intima companion',
          provider_avatar: p.avatar_url,
        }))
      )
      setLiveSessionId(liveRow?.id ?? null)
      setLoading(false)

      // Best-effort view bump (traction).
      try {
        await supabase.rpc('bump_profile_view', { pid: id })
      } catch { /* best-effort */ }
    })()
    return () => { live = false }
  }, [params.slug, supabase])

  const toggleFav = async () => {
    if (!provider || favBusy) return
    setFavBusy(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/signup?next=/companion/' + (provider.username ?? provider.id))
        return
      }
      if (isFav) {
        await supabase.from('favorites').delete().eq('user_id', user.id).eq('provider_id', provider.id)
        setIsFav(false)
      } else {
        await supabase.from('favorites').insert({ user_id: user.id, provider_id: provider.id })
        setIsFav(true)
      }
    } catch { /* best-effort */ }
    setFavBusy(false)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 animate-pulse rounded-full bg-neutral-100" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-neutral-100" />
            <div className="h-4 w-1/2 animate-pulse rounded-full bg-neutral-100" />
          </div>
        </div>
        <div className="mt-4 h-10 animate-pulse rounded-full bg-neutral-100" />
        <div className="mt-4 grid grid-cols-3 gap-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-[3/4] animate-pulse bg-neutral-100" />
          ))}
        </div>
      </div>
    )
  }

  if (notFound || !provider) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-charcoal">Profile not found</h1>
        <p className="mt-2 text-sm text-neutral-500">This companion may have removed her listing.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white">
          Back to map
        </Link>
      </div>
    )
  }

  const recency = formatRecency(provider.lastActiveAt)
  const offersVoice = provider.services.includes('voice-call')
  const offersVideo = provider.services.includes('video-call')

  const photos = [provider.avatar, ...provider.gallery].filter(Boolean) as string[]
  const slides: Array<{ kind: 'photo' | 'video'; src: string }> = [
    ...photos.map((src) => ({ kind: 'photo' as const, src })),
    ...provider.videos.map((src) => ({ kind: 'video' as const, src })),
  ]
  const totalSlides = slides.length

  return (
    <div className="mx-auto max-w-2xl pb-28 md:pb-10">
      {/* Top bar: back */}
      <div className="sticky top-0 z-20 flex items-center gap-2 bg-white/90 px-4 py-2.5 backdrop-blur-md">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-cream active:scale-95"
        >
          <ArrowLeft className="h-5 w-5 text-charcoal" />
        </button>
        <span className="text-sm font-semibold text-charcoal">{provider.displayName}</span>
      </div>

      {/* TikTok-style profile header */}
      <div className="px-4 pt-2">
        <div className="flex items-center gap-4">
          <button
            onClick={() => stories.length > 0 && setShowStories(true)}
            aria-label={stories.length > 0 ? 'View stories' : undefined}
            className="relative shrink-0"
          >
            <span className={`block rounded-full p-[2.5px] ${stories.length > 0 ? 'bg-gradient-to-tr from-gold via-primary to-gold' : ''}`}>
              <span className="block rounded-full bg-white p-[2px]">
                {provider.avatar ? (
                  <img src={provider.avatar} alt={provider.displayName} className="h-20 w-20 rounded-full object-cover" />
                ) : (
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-cream font-display text-2xl text-neutral-400">
                    {(provider.displayName[0] ?? '?').toUpperCase()}
                  </span>
                )}
              </span>
            </span>
            {liveSessionId && (
              <Link
                href={`/live/${liveSessionId}`}
                onClick={(e) => e.stopPropagation()}
                className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-bold text-white shadow"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                LIVE
              </Link>
            )}
          </button>
          <div className="flex flex-1 items-center justify-around">
            <div className="text-center">
              <p className="text-lg font-bold text-charcoal">{formatCompactCount(provider.viewCount)}</p>
              <p className="text-xs text-neutral-500">Views</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-charcoal">{formatCompactCount(provider.bookingCount)}</p>
              <p className="text-xs text-neutral-500">Bookings</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-charcoal">
                {provider.rating !== null ? provider.rating.toFixed(1) : '-'}
              </p>
              <p className="text-xs text-neutral-500">Rating ({provider.reviewCount})</p>
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <h1 className="font-display text-lg font-semibold text-charcoal">{provider.displayName}</h1>
          {provider.verified && <BadgeCheck className="h-4 w-4 text-primary" />}
        </div>
        <p className="flex items-center gap-1 text-sm text-neutral-500">
          <MapPin className="h-3.5 w-3.5" />
          {provider.area}{provider.city ? `, ${provider.city}` : ''}
        </p>
        {provider.bio && (
          <p className="mt-2 text-sm leading-relaxed text-charcoal/85">{provider.bio}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {provider.available && (
            <span className="flex items-center gap-1 font-medium text-green-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              Available now
            </span>
          )}
          {recency && <span className="text-neutral-500">{recency}</span>}
          <span className="text-neutral-500">{provider.ratesNegotiable ? 'Negotiable' : 'Fixed rates'}</span>
        </div>

        {/* Action row */}
        <div className="mt-3 flex items-center gap-2">
          {connected ? (
            <span className="flex-1 rounded-full bg-green-50 py-2.5 text-center text-sm font-bold text-green-700">
              Connected
            </span>
          ) : (
            <button
              onClick={() => setShowConnectModal(true)}
              className="flex-1 rounded-full bg-primary py-2.5 text-sm font-bold text-white active:scale-[0.98]"
            >
              Request connection
              {connectionFee !== null && (
                <span className="font-normal opacity-80"> • N{connectionFee.toLocaleString()}</span>
              )}
            </button>
          )}
          <button
            onClick={() => {
              if (!loggedIn) { showToast('Log in to start a voice call'); router.push('/signup?next=/companion/' + (provider.username ?? provider.id)); return }
              void startCall(provider.id, provider.displayName, 'voice', provider.avatar ?? undefined)
            }}
            disabled={!offersVoice}
            title={offersVoice ? 'Start a voice call' : 'She doesn\u2019t offer voice calls'}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-cream disabled:opacity-40"
          >
            <Phone className="h-4 w-4 text-charcoal" />
          </button>
          <button
            onClick={() => {
              if (!loggedIn) { showToast('Log in to start a video call'); router.push('/signup?next=/companion/' + (provider.username ?? provider.id)); return }
              void startCall(provider.id, provider.displayName, 'video', provider.avatar ?? undefined)
            }}
            disabled={!offersVideo}
            title={offersVideo ? 'Start a video call' : 'She doesn\u2019t offer video calls'}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-cream disabled:opacity-40"
          >
            <Video className="h-4 w-4 text-charcoal" />
          </button>
          <button
            onClick={toggleFav}
            disabled={favBusy}
            aria-label={isFav ? 'Remove from favorites' : 'Save to favorites'}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-cream active:scale-90"
          >
            <Heart className={'h-4 w-4 ' + (isFav ? 'fill-primary text-primary' : 'text-neutral-400')} />
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4">
          <div className="rounded-full bg-charcoal/95 px-5 py-2.5 text-sm text-white shadow-2xl backdrop-blur-md">
            {toast}
          </div>
        </div>
      )}

      {/* Icon tab bar */}
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

      {/* Tab content: fixed min-height so switching tabs never shifts layout. */}
      <div className="min-h-[320px] px-4 py-3">
        {activeTab === 'posts' && (
          totalSlides === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400">No posts yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {slides.map((slide, i) => (
                <button
                  key={i}
                  onClick={() => setLightbox(i)}
                  className="relative aspect-[3/4] overflow-hidden bg-neutral-100"
                >
                  {slide.kind === 'photo' ? (
                    <img src={slide.src} alt="" className="h-full w-full object-cover" draggable={false} />
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
          )
        )}
        {activeTab === 'services' && <ServiceChips services={provider.services} />}
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
              <p className="py-8 text-center text-sm text-neutral-400">
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
                          className={`h-3 w-3 ${s <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'}`}
                        />
                      ))}
                    </span>
                  </div>
                  {r.comment && <p className="mt-1 text-sm text-neutral-600">{r.comment}</p>}
                  <p className="mt-1 text-xs text-neutral-400">{r.date}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <p className="px-4 pb-2 text-xs text-neutral-500">Area location only, never an exact address</p>

      {/* Story viewer */}
      {showStories && stories.length > 0 && (
        <StoryViewer stories={stories} initialIndex={0} onClose={() => setShowStories(false)} />
      )}

      {/* Lightbox */}
      {lightbox !== null && slides[lightbox] && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95" onClick={() => setLightbox(null)}>
          <button
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="max-h-full w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
            {slides[lightbox].kind === 'photo' ? (
              <img src={slides[lightbox].src} alt="" className="max-h-[80vh] w-full rounded-2xl object-contain" draggable={false} />
            ) : (
              <VideoSlide src={slides[lightbox].src} active={true} />
            )}
          </div>
          {totalSlides > 1 && (
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + totalSlides) % totalSlides) }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
                aria-label="Previous"
              >
                <ChevronUp className="h-5 w-5 -rotate-90" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % totalSlides) }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
                aria-label="Next"
              >
                <ChevronUp className="h-5 w-5 rotate-90" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Request connection modal */}
      {showConnectModal && (
        <RequestConnectionModal
          providerId={provider.id}
          providerName={provider.displayName}
          providerAvatarUrl={provider.avatar}
          ratesNegotiable={provider.ratesNegotiable}
          anchorRateNgn={provider.rateShortTime}
          onClose={() => setShowConnectModal(false)}
          onConnected={() => {
            setConnected(true)
            setShowConnectModal(false)
          }}
        />
      )}
    </div>
  )
}
