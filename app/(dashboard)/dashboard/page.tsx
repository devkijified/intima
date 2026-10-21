'use client'

import { PullToRefresh } from '@/components/shared/PullToRefresh'
import { IntimaLoader } from '@/components/shared/IntimaLoader'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { computeSetupSteps, isLiveOnMap, setupProgress, type SetupProfile } from '@/lib/setup/completeness'
import { Walkthrough } from '@/components/setup/Walkthrough'
import { Eye, Star, Calendar, ShieldCheck, ArrowUpRight, Sparkles, Video, Wallet, Loader2,
  Banknote, BookOpen, Gift, ListChecks } from '@/lib/icons'
import { formatCompactCount, coinsWithNgn, ngnForCoins } from '@/lib/utils/helpers'
import { HelpTip } from '@/components/ui/Tooltip'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    profileViews: 0,
    reviews: 0,
    bookings: 0,
    saved: 0,
    coins: 0,
    referralCoins: 0,
    referralCount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState<string>('client')
  const [userId, setUserId] = useState<string | null>(null)
  const [setupProfile, setSetupProfile] = useState<SetupProfile | null>(null)
  const [presenceCity, setPresenceCity] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [isAvailable, setIsAvailable] = useState(true)
  const supabase = createClient()

  async function fetchUserData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      window.location.href = '/login'
      return
    }

    // Real tables: profiles (role, display_name, view_count),
    // provider_presence (is_available), connections, reviews.
    setUserId(user.id)
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, role, view_count, avatar_url, rate_short_time_ngn, rate_overnight_ngn, rate_weekend_ngn, services, verification_status, username')
      .eq('id', user.id)
      .maybeSingle()
    setSetupProfile((profile as unknown as SetupProfile) ?? null)
    setUsername((profile as any)?.username ?? null)

    const role = profile?.role ?? user.user_metadata?.role ?? 'client'
    const name =
      profile?.display_name ||
      user.user_metadata?.full_name ||
      user.email?.split('@')[0] ||
      'Member'

    setUserRole(role)
    setUserName(name)

    // Referral earnings (migration 043): total coins plus friends joined.
    const { data: referralRows } = await supabase
      .from('referral_rewards')
      .select('coins')
      .eq('referrer_id', user.id)
      .eq('reward_kind', 'coins')
    const referralCoins = (referralRows ?? []).reduce((s, r) => s + (r.coins ?? 0), 0)
    const referralCount = referralRows?.length ?? 0

    if (role === 'model') {
      // Availability lives in provider_presence.
      const { data: presence } = await supabase
        .from('provider_presence')
        .select('is_available, city')
        .eq('provider_id', user.id)
        .maybeSingle()
      setIsAvailable(presence?.is_available ?? true)
      setPresenceCity(presence?.city ?? null)

      // Traction stats: views, reviews, active connections.
      const [{ count: reviewsCount }, { count: bookingsCount }] = await Promise.all([
        supabase
          .from('reviews')
          .select('*', { count: 'exact', head: true })
          .eq('provider_id', user.id),
        supabase
          .from('connections')
          .select('*', { count: 'exact', head: true })
          .eq('provider_id', user.id)
          .eq('status', 'active'),
      ])

      const { data: cb1 } = await supabase.from('coin_balances').select('balance').eq('user_id', user.id).maybeSingle()
      setStats({
        coins: cb1?.balance ?? 0,
        profileViews: profile?.view_count ?? 0,
        reviews: reviewsCount ?? 0,
        bookings: bookingsCount ?? 0,
        saved: 0,
        referralCoins,
        referralCount,
      })
    } else {
      const { count: clientBookingsCount } = await supabase
        .from('connections')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', user.id)
        .eq('status', 'active')

      const { count: savedCount } = await supabase
        .from('favorites')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      const { data: cb1 } = await supabase.from('coin_balances').select('balance').eq('user_id', user.id).maybeSingle()
      setStats({
        coins: cb1?.balance ?? 0,
        profileViews: 0,
        reviews: 0,
        bookings: clientBookingsCount ?? 0,
        saved: savedCount ?? 0,
        referralCoins,
        referralCount,
      })
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchUserData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  const handleToggleAvailability = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const newStatus = !isAvailable
    setUpdatingStatus(true)
    setIsAvailable(newStatus)

    const { error } = await supabase
      .from('provider_presence')
      .upsert(
        { provider_id: user.id, is_available: newStatus, updated_at: new Date().toISOString() },
        { onConflict: 'provider_id' }
      )

    if (error) {
      console.error('Failed to update availability status:', error.message)
      setIsAvailable(!newStatus) // Revert on failure
    }

    setUpdatingStatus(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <IntimaLoader size="lg" />
          <p className="mt-3 text-sm font-medium text-neutral-500 tracking-wide font-sans">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  const isModel = userRole === 'model'
  const setupSteps = isModel ? computeSetupSteps(setupProfile, presenceCity) : []
  const setupProg = setupProgress(setupSteps)
  const showSetupBanner = isModel && !loading && !isLiveOnMap(setupSteps)

  return (
    <PullToRefresh onRefresh={fetchUserData} className="max-w-5xl mx-auto space-y-8 animate-rise-in">

      {/* Top Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-neutral-200/70">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-widest font-semibold text-[#AC244D]">
              {isModel ? 'Companion Control Panel' : 'VIP Member Account'}
            </span>
            <span className="text-neutral-300">•</span>
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
              <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-[#AC244D]" /> Securely Verified
            </span>
          </div>
          <h1 className="font-display text-[34px] font-semibold leading-tight tracking-tight text-charcoal">
            Welcome back, {userName}
          </h1>
        </div>

        <div>
          {showSetupBanner && (
        <Link href="/setup" className="card-luxe flex items-center gap-4 p-5 transition-all hover:shadow-lift active:scale-[0.99]">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white font-display text-lg font-semibold">
            {setupProg.done}/{setupProg.total}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-semibold tracking-tight text-charcoal">Finish setting up your account</span>
            <span className="block text-sm text-neutral-500">Complete your setup so clients can find and book you on the map.</span>
          </span>
          <ArrowUpRight aria-hidden className="h-5 w-5 shrink-0 text-primary" />
        </Link>
      )}

      {isModel && userId && (
        <Walkthrough userId={userId} profilePath={username ? `/companion/${username}` : '/profile'} />
      )}

      {isModel ? (
            <div className="flex items-center bg-white border border-neutral-200/85 rounded-full px-4 py-2 shadow-xs">
              <span className="text-xs font-medium text-neutral-600 mr-3">Status:</span>
              <button
                onClick={handleToggleAvailability}
                disabled={updatingStatus}
                className={`flex min-h-[44px] items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                  isAvailable ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-neutral-100 text-neutral-600'
                } ${updatingStatus ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {updatingStatus ? (
                  <Loader2 className="h-3 w-3 animate-spin text-neutral-500" />
                ) : (
                  <span className={`h-1.5 w-1.5 rounded-full ${isAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
                )}
                {isAvailable ? 'Available Now' : 'Offline'}
              </button>
            </div>
          ) : (
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center justify-center bg-[#AC244D] hover:bg-[#8F1D40] text-white text-sm font-medium px-5 py-2.5 rounded-full transition-all shadow-xs"
            >
              Browse Companions
            </Link>
          )}
        </div>
      </div>

      {/* CONDITIONAL CONTENT */}
      {isModel ? (
        /* ================= COMPANION VIEW ================= */
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="card-luxe p-5 sm:p-6 transition-all duration-200 hover:shadow-lift">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Profile views</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-muted">
                  <Eye aria-hidden className="h-4 w-4 text-[#AC244D]" />
                </span>
              </div>
              <p className="font-display text-4xl font-semibold tracking-tight text-charcoal">{formatCompactCount(stats.profileViews)}</p>
              <p className="mt-1 text-xs text-neutral-400">Total public directory visits</p>
            </div>

            <div className="card-luxe p-5 sm:p-6 transition-all duration-200 hover:shadow-lift">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Reviews</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-muted">
                  <Star className="h-4 w-4 fill-[#C9A84C] text-[#C9A84C]" />
                </span>
              </div>
              <p className="font-display text-4xl font-semibold tracking-tight text-charcoal">{stats.reviews}</p>
              <p className="mt-1 text-xs text-neutral-400">Verified client feedback</p>
            </div>

            <div className="card-luxe p-5 sm:p-6 transition-all duration-200 hover:shadow-lift">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Active connections</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50">
                  <Calendar className="h-4 w-4 text-emerald-600" />
                </span>
              </div>
              <p className="font-display text-4xl font-semibold tracking-tight text-charcoal">{stats.bookings}</p>
              <p className="mt-1 text-xs text-neutral-400">Clients you are chatting with</p>
            </div>

            <div className="card-luxe p-5 sm:p-6 transition-all duration-200 hover:shadow-lift">
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Referral earnings <HelpTip text={`Share your link. When a friend joins through it and opens their first connection, you earn ${coinsWithNgn(100)}. When a companion joins through your link, you earn ${coinsWithNgn(500)}.`} /></span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15">
                  <Gift aria-hidden className="h-4 w-4 text-[#C9A84C]" />
                </span>
              </div>
              <p className="font-display text-4xl font-semibold tracking-tight text-charcoal">{stats.referralCoins.toLocaleString()}<span className="ml-1 text-base font-normal text-neutral-400">coins</span></p>
              <p className="mt-1 text-xs text-neutral-400">≈ {ngnForCoins(stats.referralCoins)} · From {stats.referralCount} friend{stats.referralCount === 1 ? '' : 's'} who joined</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card-luxe p-4 sm:p-6">
              <h3 className="font-display text-xl font-semibold tracking-tight text-charcoal mb-3 px-1">Quick Management</h3>
              <div className="space-y-2">
                <Link href="/profile" className="flex items-center justify-between rounded-2xl p-3.5 transition-all hover:bg-cream text-neutral-700 active:scale-[0.99]">
                  <span className="text-sm font-medium">Edit Public Listing & Photos</span>
                  <ArrowUpRight aria-hidden className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/models/live" className="flex items-center justify-between rounded-2xl p-3.5 transition-all hover:bg-cream text-neutral-700 active:scale-[0.99]">
                  <span className="text-sm font-medium">Broadcast Live Show</span>
                  <Video aria-hidden className="h-4 w-4 text-[#AC244D]" />
                </Link>
                <Link href="/comics" className="flex items-center justify-between rounded-2xl p-3.5 transition-all hover:bg-cream text-neutral-700 active:scale-[0.99]">
                  <span className="text-sm font-medium">Read Intima Comics</span>
                  <BookOpen aria-hidden className="h-4 w-4 text-[#AC244D]" />
                </Link>
              </div>
            </div>

            <div className="card-luxe p-4 sm:p-6">
              <h3 className="font-display text-xl font-semibold tracking-tight text-charcoal mb-3 px-1">Bookings & Earnings</h3>
              <div className="space-y-2">
                <Link href="/bookings" className="flex items-center justify-between rounded-2xl p-3.5 transition-all hover:bg-cream text-neutral-700 active:scale-[0.99]">
                  <span className="text-sm font-medium">Manage Bookings</span>
                  <ArrowUpRight aria-hidden className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/wallet" className="flex items-center justify-between rounded-2xl p-3.5 transition-all hover:bg-cream text-neutral-700 active:scale-[0.99]">
                  <span className="text-sm font-medium">Wallet & Payouts</span>
                  <Wallet aria-hidden className="h-4 w-4 text-[#AC244D]" />
                </Link>
                <Link href="/earnings" className="flex items-center justify-between rounded-2xl p-3.5 transition-all hover:bg-cream text-neutral-700 active:scale-[0.99]">
                  <span className="text-sm font-medium">Gift Earnings & Cash Out</span>
                  <Banknote aria-hidden className="h-4 w-4 text-[#AC244D]" />
                </Link>
                <Link href="/analytics" className="flex items-center justify-between rounded-2xl p-3.5 transition-all hover:bg-cream text-neutral-700 active:scale-[0.99]">
                  <span className="text-sm font-medium">Analytics: Views, Bookings & Gifts</span>
                  <Eye aria-hidden className="h-4 w-4 text-[#AC244D]" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= CLIENT VIEW ================= */
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="card-luxe p-4 sm:p-6">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Connections</span>
                <Calendar aria-hidden className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.bookings}</p>
              <p className="text-xs text-neutral-400 mt-1">Active companion chats</p>
            </div>

            <div className="card-luxe p-4 sm:p-6">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Wallet Balance</span>
                <Wallet aria-hidden className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.coins.toLocaleString()} coins</p>
              <p className="text-xs text-neutral-400 mt-1">Worth {ngnForCoins(stats.coins)}</p>
            </div>

            <div className="card-luxe p-4 sm:p-6">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Saved</span>
                <Sparkles aria-hidden className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.saved}</p>
              <p className="text-xs text-neutral-400 mt-1">Favorite companions</p>
            </div>

            <div className="card-luxe p-4 sm:p-6">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider">Referral earnings <HelpTip text={`Share your link. When a friend joins through it and opens their first connection, you earn ${coinsWithNgn(100)}. When a companion joins through your link, you earn ${coinsWithNgn(500)}.`} /></span>
                <Gift aria-hidden className="h-4 w-4 text-[#C9A84C]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.referralCoins.toLocaleString()} coins</p>
              <p className="text-xs text-neutral-400 mt-1">≈ {ngnForCoins(stats.referralCoins)} · From {stats.referralCount} friend{stats.referralCount === 1 ? '' : 's'} who joined</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card-luxe p-4 sm:p-6">
              <h3 className="font-display text-xl font-semibold tracking-tight text-charcoal mb-3 px-1">Explore Intima</h3>
              <div className="space-y-2">
                <Link href="/" className="flex items-center justify-between rounded-2xl p-3.5 transition-all hover:bg-cream text-neutral-700 active:scale-[0.99]">
                  <span className="text-sm font-medium">Browse All Verified Companions</span>
                  <ArrowUpRight aria-hidden className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/board" className="flex items-center justify-between rounded-2xl p-3.5 transition-all hover:bg-cream text-neutral-700 active:scale-[0.99]">
                  <span className="text-sm font-medium">Request Board: Post What You Want</span>
                  <ListChecks aria-hidden className="h-4 w-4 text-[#AC244D]" />
                </Link>
                <Link href="/bookings" className="flex items-center justify-between rounded-2xl p-3.5 transition-all hover:bg-cream text-neutral-700 active:scale-[0.99]">
                  <span className="text-sm font-medium">View Booking History</span>
                  <ArrowUpRight aria-hidden className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/comics" className="flex items-center justify-between rounded-2xl p-3.5 transition-all hover:bg-cream text-neutral-700 active:scale-[0.99]">
                  <span className="text-sm font-medium">Read Intima Comics</span>
                  <BookOpen aria-hidden className="h-4 w-4 text-[#AC244D]" />
                </Link>
              </div>
            </div>

            <div className="card-luxe p-4 sm:p-6">
              <h3 className="font-display text-xl font-semibold tracking-tight text-charcoal mb-3 px-1">Account Settings</h3>
              <div className="space-y-2">
                <Link href="/profile" className="flex items-center justify-between rounded-2xl p-3.5 transition-all hover:bg-cream text-neutral-700 active:scale-[0.99]">
                  <span className="text-sm font-medium">Edit Profile & Contact Info</span>
                  <ArrowUpRight aria-hidden className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/wallet" className="flex items-center justify-between rounded-2xl p-3.5 transition-all hover:bg-cream text-neutral-700 active:scale-[0.99]">
                  <span className="text-sm font-medium">Fund Wallet / Payments</span>
                  <Wallet aria-hidden className="h-4 w-4 text-[#AC244D]" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

    </PullToRefresh>
  )
}
