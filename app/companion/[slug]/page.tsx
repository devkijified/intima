'use client'

import { useEffect, useRef, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, BadgeCheck, CheckCircle2, ChevronLeft, ChevronRight, Flag, Heart, LayoutDashboard, LayoutGrid, ListChecks,
  Lock, Map as MapIcon, MapPin, MessageCircle, Phone, Plane, Play, Radio, Share, ShieldCheck, Star, Tag, Video, X, XCircle,
} from '@/lib/icons'
import { createClient } from '@/lib/supabase/client'
import { showToast as globalShowToast } from '@/lib/toast'
import { RateCard } from '@/components/rates/RateCard'
import { ServiceChips } from '@/components/services/ServiceChips'
import { VibeChips } from '@/components/services/VibeChips'
import { SpecChips } from '@/components/services/SpecChips'
import { cleanSpec, type SpecValues } from '@/lib/spec'
import { formatRecency } from '@/lib/utils/recency'
import { formatCompactCount } from '@/lib/utils/helpers'
import { getConnectionFeeNgn } from '@/lib/settings/platformSettings'
import { useCall } from '@/components/calls/CallProvider'
import { RequestConnectionModal } from '@/components/connections/RequestConnectionModal'
import { evaluateEligibility, hasRequirements, type Eligibility } from '@/lib/connections/eligibility'
import { companionShareLink, shareLink } from '@/lib/links'
import { StoryViewer, type Story } from '@/components/stories/StoryViewer'
import { SubscribeCard } from '@/components/social/SubscribeCard'
import { PrivateSnaps } from '@/components/social/PrivateSnaps'
import { PhotoWatermark } from '@/components/media/PhotoWatermark'
import { ProfileViewTracker } from '@/components/analytics/ProfileViewTracker'
import { Tooltip, HelpTip } from '@/components/ui/Tooltip'
import type { MockReview } from '@/lib/map/mockReviews'

type PageTab = 'posts' | 'services' | 'rates' | 'reviews' | 'private'

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
  vibes: string[]
  spec: SpecValues
  languages: string[]
  ratesNegotiable: boolean
  gallery: string[]
  videos: string[]
  lastActiveAt: string | null
  travelMode: string
  travelCities: string[]
  reqVerified: boolean
  reqMinConnections: number
  reqMinDays: number
  responseRate: number | null
  avgFirstResponseMinutes: number | null
  cancellationRate: number | null
  repeatClientRate: number | null
  eligibleConnectionCount: number
  respondedConnectionCount: number
  distinctClientCount: number
  isHidden: boolean
}

/** Plain reply time wording: minutes, then hours, then days. */
function formatReplyTime(minutes: number): string {
  if (minutes < 60) {
    return `about ${Math.max(1, Math.round(minutes))} min`
  }
  if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60)
    return hours === 1 ? 'about 1 hr' : `about ${hours} hrs`
  }
  const days = Math.round(minutes / (60 * 24))
  return days === 1 ? 'about 1 day' : `about ${days} days`
}

/** One requirement row: green check when met, red cross when not, neutral when unknown (guest). */
function ReqRow({ ok, label, have }: { ok: boolean | undefined; label: string; have?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {ok === true ? (
        <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-500" />
      ) : ok === false ? (
        <XCircle className="h-4.5 w-4.5 shrink-0 text-red-400" />
      ) : (
        <span className="h-[18px] w-[18px] shrink-0 rounded-full ring-2 ring-neutral-200" />
      )}
      <span className="text-sm font-medium text-charcoal">{label}</span>
      {have && <span className="text-xs text-neutral-400">({have})</span>}
    </div>
  )
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
              <Play aria-hidden className="ml-0.5 h-5 w-5 fill-charcoal text-charcoal" />
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
    supabase.auth.getUser().then(({ data: { user } }) => {
      setLoggedIn(!!user)
      setViewerId(user?.id ?? null)
    })
  }, [supabase])

  const [provider, setProvider] = useState<Provider | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<PageTab>('posts')
  // Private snaps tab button visibility, reported by the PrivateSnaps
  // component from its own summary fetch (owner, any snaps, or a fan
  // club price set). The owner always sees the tab.
  const [privateTabVisible, setPrivateTabVisible] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)
  // Lightbox swipe tracking: horizontal swipe moves between slides,
  // the gallery habit from Instagram and TikTok (45px, the same
  // threshold the story viewer uses). Buttons stay for discoverability.
  const lightboxTouchX = useRef<number | null>(null)
  // The slide count is computed far below (after the loading and
  // not-found early returns), so the keyboard effect up here reads
  // it through a ref: a useEffect placed below those early returns
  // would change the hook order between renders and crash the page.
  const totalSlidesRef = useRef(0)

  // Desktop half of the gallery habit: arrow keys move between
  // slides and Escape closes while the lightbox is open.
  useEffect(() => {
    if (lightbox === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
      const total = totalSlidesRef.current
      if (total < 2) return
      if (e.key === 'ArrowRight') setLightbox((cur) => (cur === null ? cur : (cur + 1) % total))
      if (e.key === 'ArrowLeft')
        setLightbox((cur) => (cur === null ? cur : (cur - 1 + total) % total))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox === null])
  const [reviews, setReviews] = useState<MockReview[]>([])
  const [connectionFee, setConnectionFee] = useState<number | null>(null)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [connected, setConnected] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [eligibility, setEligibility] = useState<Eligibility | null>(null)
  // Global toast: renders from the root layout host, so a message
  // raised just before a redirect to login or signup is still
  // visible when that page lands.
  const showToast = (msg: string) => globalShowToast(msg)

  // Favorites.
  const [isFav, setIsFav] = useState(false)
  const [favBusy, setFavBusy] = useState(false)
  const [following, setFollowing] = useState(false)
  const [followerCount, setFollowerCount] = useState<number | null>(null)
  const [tours, setTours] = useState<{ city: string; start_date: string; end_date: string }[]>([])
  const [followBusy, setFollowBusy] = useState(false)

  // Stories + live.
  const [stories, setStories] = useState<Story[]>([])
  const [storyStartIndex, setStoryStartIndex] = useState(0)
  const [showStories, setShowStories] = useState(false)
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getConnectionFeeNgn().then((fee) => {
      if (live) setConnectionFee(fee)
    })
    return () => { live = false }
  }, [])

  // Story CTA deep link: /companion/<id>?connect=1 lands here with
  // the connect modal already open (or a login first, which returns
  // to this same URL). Fires once, only when the profile is ready.
  const connectDeepLinkFired = useRef(false)
  useEffect(() => {
    if (connectDeepLinkFired.current) return
    if (loading || !provider || isOwner) return
    let wantsConnect = false
    try {
      wantsConnect = new URLSearchParams(window.location.search).get('connect') === '1'
    } catch { /* no query string */ }
    if (!wantsConnect) return
    connectDeepLinkFired.current = true
    if (!loggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/companion/${params.slug}?connect=1`)}`)
      return
    }
    if (!connected) setShowConnectModal(true)
  }, [loading, provider, loggedIn, connected, isOwner, params.slug, router])

  useEffect(() => {
    let live = true
    ;(async () => {
      const slug = params.slug
      if (!slug) { setNotFound(true); setLoading(false); return }

      // Provider row: username first (shareable /companion/adaeze),
      // then raw id as fallback.
      const base = () => supabase
        .from('profiles')
        .select('id, username, bio, display_name, avatar_url, is_verified, rate_short_time_ngn, rate_overnight_ngn, rate_weekend_ngn, services, vibes, spec_complexion, spec_body_type, spec_height, spec_tags, languages, rates_negotiable, gallery_urls, video_urls, view_count, travel_mode, travel_cities, req_verified_client, req_min_connections, req_min_account_days')
        .eq('role', 'model')
      const { data: byName } = await base().eq('username', slug).maybeSingle()
      const { data: byId } = byName ? { data: null } : await base().eq('id', slug).maybeSingle()
      const p = byName ?? byId
      if (!p) {
        if (live) { setNotFound(true); setLoading(false) }
        return
      }
      const id = p.id

      // Hidden flag (migration 044): fetched separately so the page
      // keeps working before the migration runs; a missing column
      // just reads as not hidden.
      const { data: hiddenRow } = await supabase
        .from('profiles')
        .select('is_hidden')
        .eq('id', id)
        .maybeSingle()

      // Presence: city + availability + recency.
      const { data: presence } = await supabase
        .from('provider_presence')
        .select('city, is_available, updated_at')
        .eq('provider_id', id)
        .maybeSingle()

      // Reviews: count, average, latest rows. Double-blind release runs
      // first so due reviews land; RLS only ever returns published rows
      // to visitors, and reviewee_id keeps client reviews out of this list.
      await supabase.rpc('publish_due_reviews')
      const { data: reviewRows, count: reviewCount } = await supabase
        .from('reviews')
        .select('id, rating, comment, created_at', { count: 'exact' })
        .eq('reviewee_id', id)
        .order('created_at', { ascending: false })
        .limit(10)

      // Bookings: active connection count. The direct count is
      // RLS-bound (only the two parties can read a connection), so
      // for everyone else it reads 0; the public view's booking_count
      // below is the number visitors should see, and this direct
      // count remains only as a fallback for profiles the view does
      // not carry (not on the map yet).
      const { count: bookingCount } = await supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('provider_id', id)
        .eq('status', 'active')

      // Trust metrics from the public view (migration 038). When the
      // view has no row for her, or the migration has not run yet,
      // every value stays null and the Trust section stays hidden.
      const { data: trustRow } = await supabase
        .from('map_providers')
        .select('booking_count, response_rate, avg_first_response_minutes, cancellation_rate, repeat_client_rate, eligible_connection_count, responded_connection_count, distinct_client_count')
        .eq('provider_id', id)
        .maybeSingle()

      // Active stories for the story ring.
      const { data: storyRows } = await supabase
        .from('stories')
        .select('id, provider_id, media_url, media_type, caption, created_at, is_subscribers_only')
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
      if (live) setIsOwner(!!user && user.id === id)
      if (user && user.id !== id) {
        const req = {
          req_verified_client: (p as any).req_verified_client === true,
          req_min_connections: (p as any).req_min_connections ?? 0,
          req_min_account_days: (p as any).req_min_account_days ?? 0,
        }
        if (hasRequirements(req)) {
          const result = await evaluateEligibility(supabase, user.id, user.created_at ?? null, req)
          if (live) setEligibility(result)
        }
      }
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
        const { data: fol } = await supabase
          .from('broadcast_follows')
          .select('provider_id')
          .eq('provider_id', id)
          .eq('follower_id', user.id)
          .maybeSingle()
        if (live) setFollowing(!!fol)
      }
      // Public follower count (security-definer RPC, migration 069:
      // the follows table itself only ever shows a visitor her own row).
      const { data: fc } = await supabase.rpc('follower_count', { pid: id })
      if (live && typeof fc === 'number') setFollowerCount(fc)

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
        bookingCount: (trustRow as any)?.booking_count ?? bookingCount ?? 0,
        viewCount: p.view_count ?? 0,
        rateShortTime: p.rate_short_time_ngn,
        rateOvernight: p.rate_overnight_ngn,
        rateWeekend: p.rate_weekend_ngn,
        services: p.services ?? [],
        vibes: (p as { vibes?: string[] }).vibes ?? [],
        spec: cleanSpec({
          complexion: (p as any)?.spec_complexion ?? null,
          bodyType: (p as any)?.spec_body_type ?? null,
          height: (p as any)?.spec_height ?? null,
          tags: (p as any)?.spec_tags ?? [],
        }),
        languages: (p as { languages?: string[] }).languages ?? [],
        ratesNegotiable: p.rates_negotiable !== false,
        gallery: p.gallery_urls ?? [],
        videos: p.video_urls ?? [],
        lastActiveAt: presence?.updated_at ?? null,
        travelMode: (p as any).travel_mode ?? 'none',
        travelCities: (p as any).travel_cities ?? [],
        reqVerified: (p as any).req_verified_client === true,
        reqMinConnections: (p as any).req_min_connections ?? 0,
        reqMinDays: (p as any).req_min_account_days ?? 0,
        responseRate: (trustRow as any)?.response_rate ?? null,
        avgFirstResponseMinutes: (trustRow as any)?.avg_first_response_minutes ?? null,
        cancellationRate: (trustRow as any)?.cancellation_rate ?? null,
        repeatClientRate: (trustRow as any)?.repeat_client_rate ?? null,
        eligibleConnectionCount: (trustRow as any)?.eligible_connection_count ?? 0,
        respondedConnectionCount: (trustRow as any)?.responded_connection_count ?? 0,
        distinctClientCount: (trustRow as any)?.distinct_client_count ?? 0,
        isHidden: (hiddenRow as any)?.is_hidden === true,
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
      // Subscribers only stories stay hidden unless the viewer is her
      // or has an effective fan club subscription to her.
      let visibleStoryRows = storyRows ?? []
      if (
        user?.id !== id &&
        visibleStoryRows.some((s) => (s as { is_subscribers_only?: boolean }).is_subscribers_only)
      ) {
        let isFan = false
        if (user) {
          const { data: mySubs } = await supabase
            .from('subscriptions')
            .select('status, current_period_end')
            .eq('subscriber_id', user.id)
            .eq('provider_id', id)
          const nowMs = Date.now()
          isFan = (mySubs ?? []).some(
            (s) =>
              s.status === 'active' ||
              (s.status === 'cancelled' && new Date(s.current_period_end).getTime() > nowMs)
          )
        }
        if (!isFan) {
          visibleStoryRows = visibleStoryRows.filter(
            (s) => !(s as { is_subscribers_only?: boolean }).is_subscribers_only
          )
        }
      }
      // The ring opens the viewer at HER first unseen story, not
      // always her oldest one.
      let firstUnseen = 0
      if (user && visibleStoryRows.length > 0) {
        const { data: seenRows } = await supabase
          .from('story_views')
          .select('story_id')
          .eq('viewer_id', user.id)
          .in('story_id', visibleStoryRows.map((s) => s.id))
        const seenIds = new Set((seenRows ?? []).map((r) => r.story_id as string))
        const idx = visibleStoryRows.findIndex((s) => !seenIds.has(s.id))
        firstUnseen = idx >= 0 ? idx : 0
      }
      if (live) setStoryStartIndex(firstUnseen)
      setStories(
        visibleStoryRows.map((s) => ({
          id: s.id,
          provider_id: s.provider_id,
          media_url: s.media_url,
          media_type: s.media_type as 'photo' | 'video',
          caption: s.caption,
          created_at: s.created_at,
          provider_name: p.display_name ?? 'Intima companion',
          provider_avatar: p.avatar_url,
          provider_username: p.username ?? null,
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

  // Safety report (POST /api/reports): private, leak-scanned
  // server-side; 3 open reports in 30 days hides the profile
  // pending admin review (migration 044 threshold).
  const [showReport, setShowReport] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportDetails, setReportDetails] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const submitReport = async () => {
    if (!provider || reportBusy) return
    if (!reportReason) { showToast('Pick what best describes the problem'); return }
    setReportBusy(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: provider.id,
          reason: reportReason,
          details: reportDetails.trim() || undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { showToast(data.error ?? 'Could not file the report'); return }
      setShowReport(false)
      setReportReason('')
      setReportDetails('')
      showToast('Report sent. Our team will review it.')
    } catch {
      showToast('Could not file the report')
    } finally {
      setReportBusy(false)
    }
  }

  const toggleFollow = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { showToast('Log in to follow'); window.location.href = '/login?next=/companion/' + encodeURIComponent(params.slug); return }
    setFollowBusy(true)
    if (following) {
      const { error } = await supabase.from('broadcast_follows').delete().eq('provider_id', provider?.id).eq('follower_id', user.id)
      if (error) {
        showToast('Could not unfollow. Please try again')
      } else {
        setFollowing(false)
        setFollowerCount((c) => (c === null ? c : Math.max(0, c - 1)))
      }
    } else {
      const { error } = await supabase.from('broadcast_follows').insert({ provider_id: provider?.id, follower_id: user.id })
      if (error && error.code !== '23505') {
        showToast('Could not follow. Please try again')
      } else {
        // 23505 means the follow was already saved; the state now matches.
        setFollowing(true)
        if (!error) setFollowerCount((c) => (c === null ? c : c + 1))
        showToast('Following. You will be notified when she goes live')
      }
    }
    setFollowBusy(false)
  }

  const toggleFav = async () => {
    if (!provider || favBusy) return
    setFavBusy(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        showToast('Log in to save')
        router.push('/signup?next=/companion/' + (provider.username ?? provider.id))
        return
      }
      // Only flip the heart when the write actually landed: the old code
      // flipped unconditionally, so a rejected insert showed a saved
      // companion that was never stored.
      if (isFav) {
        const { error } = await supabase.from('favorites').delete().eq('user_id', user.id).eq('provider_id', provider.id)
        if (error) { showToast('Could not remove. Please try again'); return }
        setIsFav(false)
      } else {
        const { error } = await supabase.from('favorites').insert({ user_id: user.id, provider_id: provider.id })
        if (error && error.code !== '23505') { showToast('Could not save. Please try again'); return }
        setIsFav(true)
      }
    } catch {
      showToast('Could not save. Please try again')
    } finally {
      setFavBusy(false)
    }
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
        <Link href="/" className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white">
          Back to map
        </Link>
      </div>
    )
  }

  // Hidden by the report threshold (migration 044): everyone but the
  // owner gets a neutral unavailable state with no profile details.
  // The owner still sees her page, with the review banner below.
  const viewerIsOwner = isOwner || (viewerId !== null && viewerId === provider.id)
  if (provider.isHidden && !viewerIsOwner) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-charcoal">This profile is not available right now.</h1>
        <Link href="/" className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white">
          Back to map
        </Link>
      </div>
    )
  }

  const tabs: { value: PageTab; icon: ComponentType<{ className?: string }>; label: string }[] = [
    { value: 'posts', icon: LayoutGrid, label: 'Posts' },
    { value: 'services', icon: ListChecks, label: 'Services' },
    { value: 'rates', icon: Tag, label: 'Rates' },
    { value: 'reviews', icon: Star, label: 'Reviews' },
  ]
  if (viewerIsOwner || privateTabVisible) {
    tabs.push({ value: 'private', icon: Lock, label: 'Fans Only' })
  }

  const recency = formatRecency(provider.lastActiveAt)
  const offersVoice = provider.services.includes('voice-call')
  const offersVideo = provider.services.includes('video-call')

  // Trust section guards: small samples stay hidden so a handful of
  // early connections never reads as a verdict. Cancellation needs
  // the biggest sample because it is the harshest number.
  const showResponseRate = provider.responseRate !== null && provider.eligibleConnectionCount >= 3
  const showReplyTime = provider.avgFirstResponseMinutes !== null && provider.respondedConnectionCount >= 3
  const showCancellationRate = provider.cancellationRate !== null && provider.eligibleConnectionCount >= 5
  const showRepeatRate = provider.repeatClientRate !== null && provider.distinctClientCount >= 3
  const showTrust = showResponseRate || showReplyTime || showCancellationRate || showRepeatRate

  const photos = [provider.avatar, ...provider.gallery].filter(Boolean) as string[]
  const slides: Array<{ kind: 'photo' | 'video'; src: string }> = [
    ...photos.map((src) => ({ kind: 'photo' as const, src })),
    ...provider.videos.map((src) => ({ kind: 'video' as const, src })),
  ]
  const totalSlides = slides.length
  totalSlidesRef.current = totalSlides

  return (
    <div className="mx-auto max-w-2xl pb-28 md:pb-10">
      <ProfileViewTracker providerId={provider.id} />
      {/* Top bar: back */}
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-black/[0.04] bg-cream/85 px-4 py-2.5 backdrop-blur-xl" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top, 0px))' }}>
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-cream active:scale-95"
        >
          <ArrowLeft aria-hidden className="h-5 w-5 text-charcoal" />
        </button>
        <span className="text-sm font-semibold text-charcoal">{provider.displayName}</span>
      </div>

      {provider.isHidden && viewerIsOwner && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your profile is hidden from the map right now while our team reviews reports about it.{' '}
          <Link href="/tickets" className="font-semibold underline">Contact support</Link> if you think this is a mistake.
        </div>
      )}

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
                className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                LIVE
              </Link>
            )}
          </button>
          <div className="flex flex-1 items-center">
            <div className="flex-1 text-center">
              <p className="font-display text-[22px] font-semibold text-charcoal">{formatCompactCount(provider.viewCount)}</p>
              <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Views</p>
            </div>
            <div className="h-9 w-px bg-neutral-200/70" />
            <div className="flex-1 text-center">
              <p className="font-display text-[22px] font-semibold text-charcoal">{formatCompactCount(provider.bookingCount)}</p>
              <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Bookings</p>
            </div>
            <div className="h-9 w-px bg-neutral-200/70" />
            <div className="flex-1 text-center">
              <p className="font-display text-[22px] font-semibold text-charcoal">
                {provider.rating !== null ? provider.rating.toFixed(1) : '-'}
              </p>
              <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Rating ({provider.reviewCount})</p>
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-charcoal">{provider.displayName}</h1>
          {provider.verified && <BadgeCheck className="h-4 w-4 text-primary" />}
          {provider.verified && (
            <HelpTip text="This badge means Intima checked the companion's government ID against a live selfie, so the person in the photos is the person you meet. A gold ring on the photo marks an Elite companion with a strong booking record." />
          )}
        </div>
        {provider.username && (
          <p className="text-[13px] font-medium text-neutral-400">@{provider.username}</p>
        )}
        <p className="flex items-center gap-1 text-sm text-neutral-500">
          <MapPin aria-hidden className="h-3.5 w-3.5" />
          {provider.area}{provider.city ? `, ${provider.city}` : ''}
        </p>
        {provider.bio && (
          <p className="mt-2 text-sm leading-relaxed text-charcoal/85">{provider.bio}</p>
        )}
        {tours.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {tours.map((t: { city: string; start_date: string; end_date: string }, i: number) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-3 py-1 text-xs font-semibold text-charcoal">
                <MapPin aria-hidden className="h-3 w-3 text-primary" />
                In {t.city} · {new Date(t.start_date + 'T00:00:00').toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })} – {new Date(t.end_date + 'T00:00:00').toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}
              </span>
            ))}
          </div>
        )}
        {(provider.travelMode === 'nationwide' || provider.travelCities.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {provider.travelMode === 'nationwide' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-muted px-3 py-1 text-xs font-semibold text-primary">
                <Plane className="h-3 w-3" /> Can travel anywhere in Nigeria
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-muted px-3 py-1 text-xs font-semibold text-primary">
                <Plane className="h-3 w-3" /> Can travel to {provider.travelCities.join(', ')}
              </span>
            )}
          </div>
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
          <HelpTip
            text={
              provider.ratesNegotiable
                ? 'Negotiable means you can propose your own rate when you request a connection. The companion can accept your offer or keep the listed rate.'
                : 'Fixed rates means the listed rate is final, so there is no propose a rate box for this companion.'
            }
          />
        </div>

        {/* Trust: how she shows up once a connection starts */}
        {showTrust && (
          <div className="card-luxe mt-4 p-4">
            <p className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.1em] text-neutral-400">
              <ShieldCheck className="h-4 w-4 text-primary" /> Trust
              <HelpTip text="These numbers come from this companion's real connections on Intima: how often they reply, how fast, how rarely they cancel, and how many clients book again." />
            </p>
            <div className="mt-2.5 space-y-1.5 text-sm text-charcoal">
              {showResponseRate && provider.responseRate !== null && (
                <p>Responds to {Math.round(provider.responseRate * 100)}% of connections</p>
              )}
              {showReplyTime && provider.avgFirstResponseMinutes !== null && (
                <p>Typically replies in {formatReplyTime(provider.avgFirstResponseMinutes)}</p>
              )}
              {showCancellationRate && provider.cancellationRate !== null && (
                <p>Cancellation rate {Math.round(provider.cancellationRate * 100)}%</p>
              )}
              {showRepeatRate && provider.repeatClientRate !== null && (
                <p>{Math.round(provider.repeatClientRate * 100)}% of clients book again</p>
              )}
            </div>
          </div>
        )}

        {/* Who can book her: Bybit-style counterparty requirements */}
        {(provider.reqVerified || provider.reqMinConnections > 0 || provider.reqMinDays > 0) && (
          <div id="book-requirements" className="card-luxe mt-4 scroll-mt-24 p-4">
            <p className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.1em] text-neutral-400">
              <ShieldCheck className="h-4 w-4 text-primary" /> Who she accepts
              <HelpTip text="These are requirements this companion set for new clients. Meet every one and the Request connection button opens for you." />
            </p>
            <div className="mt-2.5 space-y-2">
              {provider.reqVerified && (
                <ReqRow
                  ok={eligibility ? eligibility.checks.find((c) => c.key === 'verified')?.ok : undefined}
                  label="ID verified clients only"
                  have={eligibility?.checks.find((c) => c.key === 'verified')?.have}
                />
              )}
              {provider.reqMinConnections > 0 && (
                <ReqRow
                  ok={eligibility ? eligibility.checks.find((c) => c.key === 'connections')?.ok : undefined}
                  label={`At least ${provider.reqMinConnections} completed bookings`}
                  have={eligibility?.checks.find((c) => c.key === 'connections')?.have}
                />
              )}
              {provider.reqMinDays > 0 && (
                <ReqRow
                  ok={eligibility ? eligibility.checks.find((c) => c.key === 'account_age')?.ok : undefined}
                  label={`Account at least ${provider.reqMinDays} days old`}
                  have={eligibility?.checks.find((c) => c.key === 'account_age')?.have}
                />
              )}
            </div>
            {eligibility && !eligibility.eligible && (
              <div className="mt-3 flex flex-wrap gap-2">
                {eligibility.checks.find((c) => c.key === 'verified' && !c.ok) && (
                  <Link href="/verification" className="btn-luxe inline-flex min-h-[44px] items-center px-4 py-2 text-[13px]">Get verified</Link>
                )}
                <p className="w-full text-xs text-neutral-400">Once you meet these, the booking button opens.</p>
              </div>
            )}
            {!loggedIn && (
              <p className="mt-2 text-xs text-neutral-400">Sign in and we will check yours against this list.</p>
            )}
          </div>
        )}

        {/* Action row: wraps on narrow phones so the CTA never crushes */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {viewerId !== null && viewerId === provider.id ? (
            <Link
              href="/profile"
              className="btn-luxe h-12 min-w-[218px] flex-1 gap-1.5 whitespace-nowrap px-4 text-[15px]"
            >
              Edit your profile
            </Link>
          ) : connected ? (
            <span className="flex-1 rounded-full bg-green-50 py-2.5 text-center text-sm font-bold text-green-700">
              Connected
            </span>
          ) : eligibility && !eligibility.eligible ? (
            <button
              onClick={() => document.getElementById('book-requirements')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="h-12 flex-1 rounded-full bg-white text-[15px] font-semibold text-neutral-500 shadow-soft ring-1 ring-black/[0.08] transition-all active:scale-[0.98]"
            >
              Requirements not met yet
            </button>
          ) : (
            <button
              onClick={() => {
                if (!loggedIn) {
                  router.push(`/login?next=${encodeURIComponent(`/companion/${params.slug}`)}`)
                  return
                }
                setShowConnectModal(true)
              }}
              className="btn-luxe h-12 min-w-[218px] flex-1 gap-1.5 whitespace-nowrap px-4 text-[15px]"
            >
              Request connection
              {connectionFee !== null && (
                <span className="shrink-0 text-[13px] font-normal text-white/85">• ₦{connectionFee.toLocaleString()}</span>
              )}
            </button>
          )}
          <HelpTip
            className="shrink-0 self-center"
            text={`The connection fee opens your private chat with ${provider.displayName}, plus voice and video calls. It is the only charge Intima takes on the booking; the companion keeps all of their own rate. If anything goes wrong, you can open a dispute within 24 hours and the fee can be refunded.`}
          />
          <Tooltip label={offersVoice ? 'Start a voice call' : 'She doesn\u2019t offer voice calls'}>
          <button
            onClick={() => {
              if (!offersVoice) { showToast('She does not offer voice calls'); return }
              if (!loggedIn) { showToast('Log in to start a voice call'); router.push('/signup?next=/companion/' + (provider.username ?? provider.id)); return }
              void startCall(provider.id, provider.displayName, 'voice', provider.avatar ?? undefined)
            }}
            title={offersVoice ? 'Start a voice call' : 'She doesn\u2019t offer voice calls'}
            aria-label={offersVoice ? 'Start a voice call' : 'She doesn\u2019t offer voice calls'}
            className={`flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-soft ring-1 ring-black/[0.06] transition-all active:scale-90 ${!offersVoice ? 'opacity-40 shadow-none' : ''}`}
          >
            <Phone aria-hidden className="h-4 w-4 text-charcoal" />
          </button>
          </Tooltip>
          <Tooltip label={offersVideo ? 'Start a video call' : 'She doesn\u2019t offer video calls'}>
          <button
            onClick={() => {
              if (!offersVideo) { showToast('She does not offer video calls'); return }
              if (!loggedIn) { showToast('Log in to start a video call'); router.push('/signup?next=/companion/' + (provider.username ?? provider.id)); return }
              void startCall(provider.id, provider.displayName, 'video', provider.avatar ?? undefined)
            }}
            title={offersVideo ? 'Start a video call' : 'She doesn\u2019t offer video calls'}
            aria-label={offersVideo ? 'Start a video call' : 'She doesn\u2019t offer video calls'}
            className={`flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-soft ring-1 ring-black/[0.06] transition-all active:scale-90 ${!offersVideo ? 'opacity-40 shadow-none' : ''}`}
          >
            <Video aria-hidden className="h-4 w-4 text-charcoal" />
          </button>
          </Tooltip>
          <Tooltip label={isFav ? 'Remove from favorites' : 'Save to favorites'}>
          <button
            onClick={toggleFav}
            disabled={favBusy}
            aria-label={isFav ? 'Remove from favorites' : 'Save to favorites'}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-soft ring-1 ring-black/[0.06] active:scale-90"
          >
            <Heart aria-hidden className={'h-4 w-4 ' + (isFav ? 'fill-primary text-primary' : 'text-neutral-400')} />
          </button>
          </Tooltip>
          {viewerId !== provider.id && (
            <button
              onClick={toggleFollow}
              disabled={followBusy}
              className={'inline-flex min-h-[44px] items-center rounded-full px-4 py-2 text-xs font-semibold transition-all ' + (following ? 'bg-cream text-charcoal' : 'bg-gold text-charcoal')}
            >
              {following ? 'Following' : 'Follow'}
            </button>
          )}
          {viewerId !== provider.id && (
            <HelpTip text="Following is free. It only sends you a notification when this companion goes live, and it is separate from the paid fan club." />
          )}
          {followerCount !== null && followerCount > 0 && (
            <span className="text-xs font-medium text-neutral-500">
              {followerCount.toLocaleString()} {followerCount === 1 ? 'follower' : 'followers'}
            </span>
          )}
          <Tooltip label="Share her page">
          <button
            onClick={async () => {
              if (!provider.username) { showToast('Link not ready yet'); return }
              const how = await shareLink({
                url: companionShareLink(provider.username),
                title: `${provider.displayName} on Intima`,
                text: `Book ${provider.displayName} direct on Intima. Verified, no agents.`,
              })
              showToast(how === 'copied' ? 'Link copied' : 'Shared')
            }}
            aria-label="Share her page"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-soft ring-1 ring-black/[0.06] transition-all active:scale-90"
          >
            <Share aria-hidden className="h-4 w-4 text-charcoal" />
          </button>
          </Tooltip>
          {viewerId !== provider.id && (
            <Tooltip label="Report this profile">
            <button
              onClick={() => {
                if (!loggedIn) { showToast('Log in to file a report'); router.push('/signup?next=/companion/' + (provider.username ?? provider.id)); return }
                setShowReport(true)
              }}
              aria-label="Report this profile"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-soft ring-1 ring-black/[0.06] transition-all active:scale-90"
            >
              <Flag aria-hidden className="h-4 w-4 text-neutral-400" />
            </button>
            </Tooltip>
          )}
        </div>

        {/* Fan club: hidden for her own page; the card itself renders
            nothing when she has not set a price */}
        {viewerId !== provider.id && (
          <SubscribeCard providerId={provider.id} providerName={provider.displayName} />
        )}
      </div>

      {/* Report sheet: files POST /api/reports. Text is leak-scanned
          server-side, so the copy warns against contact details. */}
      {showReport && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onClick={() => { if (!reportBusy) setShowReport(false) }}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:rounded-3xl sm:pb-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-charcoal">Report {provider.displayName}</h3>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  Private. Our team reviews every report. Please do not include phone numbers or social handles here.
                </p>
              </div>
              <button
                onClick={() => setShowReport(false)}
                aria-label="Close report"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream ring-1 ring-black/[0.06]"
              >
                <X aria-hidden className="h-4 w-4 text-charcoal" />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Fake profile', 'Scam or fraud', 'Harassment', 'Underage concern', 'Impersonation', 'Other'].map((r) => (
                <button
                  key={r}
                  onClick={() => setReportReason(r)}
                  className={
                    'inline-flex min-h-[44px] items-center rounded-full px-4 py-2 text-xs font-semibold ring-1 transition-all ' +
                    (reportReason === r
                      ? 'bg-primary text-white ring-primary'
                      : 'bg-cream text-charcoal ring-black/[0.06]')
                  }
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Tell us what happened (optional, but it helps)"
              className="mt-4 w-full rounded-2xl bg-cream px-4 py-3 text-base text-charcoal outline-none ring-1 ring-black/[0.06] placeholder:text-neutral-400 focus:ring-primary/40 md:text-sm"
            />
            <button
              onClick={submitReport}
              disabled={reportBusy}
              className="btn-luxe mt-4 h-12 w-full text-[15px] disabled:opacity-50"
            >
              {reportBusy ? 'Sending...' : 'Send report'}
            </button>
          </div>
        </div>
      )}

      {/* Icon tab bar */}
      <div className="mt-3 flex border-b border-neutral-100">
        {tabs.map(({ value, icon: Icon, label }) => (
          <Tooltip key={value} label={label} wrapperClassName="flex flex-1">
          <button
            onClick={() => setActiveTab(value)}
            aria-label={label}
            className={`relative flex flex-1 items-center justify-center py-3.5 transition-colors ${
              activeTab === value ? 'text-charcoal' : 'text-neutral-500 hover:text-charcoal'
            }`}
          >
            <Icon className="h-5 w-5" />
            {activeTab === value && (
              <span className="absolute inset-x-10 bottom-0 h-0.5 rounded-full bg-charcoal" />
            )}
          </button>
          </Tooltip>
        ))}
      </div>

      {/* Tab content: fixed min-height so switching tabs never shifts layout. */}
      <div className="min-h-[320px] px-4 py-3">
        {activeTab === 'posts' && (
          totalSlides === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-400">No posts yet.</p>
          ) : (
            <div data-protect className="grid grid-cols-3 gap-1">
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
                  <span className="absolute bottom-1 left-1 flex items-center gap-0.5 text-[11px] font-semibold text-white drop-shadow">
                    <Play aria-hidden className="h-2.5 w-2.5 fill-white" />
                    {formatCompactCount(Math.max(1, Math.round(provider.viewCount / Math.max(1, totalSlides))))}
                  </span>
                  <PhotoWatermark username={provider.username} className="bottom-1 right-1" />
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
        {activeTab === 'services' && (
          <div className="space-y-4">
            <VibeChips vibes={provider.vibes} />
            <SpecChips spec={provider.spec} />
            <ServiceChips services={provider.services} />
            {provider.languages.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Languages</p>
                <div className="flex flex-wrap gap-2">
                  {provider.languages.map((lang) => (
                    <span key={lang} className="inline-flex items-center rounded-full bg-cream px-3 py-1.5 text-[13px] font-medium text-neutral-600 ring-1 ring-black/[0.06]">
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
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
              <p className="py-8 text-center text-sm text-neutral-400">
                No reviews yet. Be the first to book and review.
              </p>
            ) : (
              reviews.map((r) => (
                <div key={r.id} className="rounded-2xl bg-cream p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-charcoal">{r.author}</span>
                    <span className="flex items-center gap-0.5" role="img" aria-label={`Rated ${r.rating} out of 5`}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          aria-hidden
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
        {/* Private snaps: always mounted so the component can report
            tab visibility from its own summary fetch; it renders its
            body only when the private tab is active. */}
        <PrivateSnaps
          providerId={provider.id}
          providerName={provider.displayName}
          providerUsername={provider.username}
          isOwner={viewerIsOwner}
          active={activeTab === 'private'}
          onVisibilityChange={setPrivateTabVisible}
        />
      </div>

      <p className="px-4 pb-2 text-xs text-neutral-500">Area location only, never an exact address</p>

      {/* Story viewer: portalled to the body so its z-index competes
          at the root and always tops page chrome. */}
      {showStories && stories.length > 0 && createPortal(
        <StoryViewer stories={stories} initialIndex={storyStartIndex} onClose={() => setShowStories(false)} />,
        document.body
      )}

      {/* Lightbox */}
      {lightbox !== null && slides[lightbox] && (
        <div
          className="fixed inset-0 z-[80] flex touch-none items-center justify-center bg-black/95"
          onClick={() => setLightbox(null)}
          onTouchStart={(e) => {
            lightboxTouchX.current = e.touches[0]?.clientX ?? null
          }}
          onTouchEnd={(e) => {
            const startX = lightboxTouchX.current
            lightboxTouchX.current = null
            if (startX === null || totalSlides < 2) return
            const dx = (e.changedTouches[0]?.clientX ?? startX) - startX
            if (Math.abs(dx) < 45) return
            setLightbox(
              dx < 0
                ? (lightbox + 1) % totalSlides
                : (lightbox - 1 + totalSlides) % totalSlides
            )
          }}
        >
          <Tooltip label="Close" wrapperClassName="absolute right-4 top-4">
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox(null) }}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
          </Tooltip>
          <div data-protect className="relative max-h-full w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
            <PhotoWatermark username={provider.username} variant="edge" />
            {slides[lightbox].kind === 'photo' ? (
              <img src={slides[lightbox].src} alt="" className="max-h-[80vh] w-full rounded-2xl object-contain" draggable={false} />
            ) : (
              <VideoSlide src={slides[lightbox].src} active={true} />
            )}
          </div>
          {totalSlides > 1 && (
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
              <Tooltip label="Previous">
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + totalSlides) % totalSlides) }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
                aria-label="Previous"
              >
                <ChevronLeft aria-hidden className="h-5 w-5" />
              </button>
              </Tooltip>
              <Tooltip label="Next">
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % totalSlides) }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
                aria-label="Next"
              >
                <ChevronRight aria-hidden className="h-5 w-5" />
              </button>
              </Tooltip>
            </div>
          )}
        </div>
      )}

      {/* Signed-in mobile bottom bar: companion pages live outside
          the dashboard shell, so without this the bar vanishes here.
          Same five destinations, Map popped in the middle. */}
      {loggedIn && (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-black/[0.06] bg-[#FDF9F6]/95 backdrop-blur-md md:hidden">
          <div className="grid grid-cols-5 px-1 py-1.5">
            {[
              { href: '/dashboard', label: 'Home', Icon: LayoutDashboard, pop: false },
              { href: '/live', label: 'Live', Icon: Radio, pop: false },
              { href: '/', label: 'Map', Icon: MapIcon, pop: true },
              { href: '/messages', label: 'Messages', Icon: MessageCircle, pop: false },
              { href: '/dashboard', label: 'More', Icon: LayoutGrid, pop: false },
            ].map(({ href, label, Icon, pop }) => (
              <Link
                key={label}
                href={href}
                className="flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium text-neutral-400"
              >
                {pop ? (
                  <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-[#AC244D] text-white shadow-[0_8px_20px_rgba(172,36,77,0.45)] ring-4 ring-[#FDF9F6]">
                    <Icon className="h-6 w-6" />
                  </span>
                ) : (
                  <Icon className="h-5 w-5" />
                )}
                {label}
              </Link>
            ))}
          </div>
          <div className="h-[env(safe-area-inset-bottom)]" />
        </nav>
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
