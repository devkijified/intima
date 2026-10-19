'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, Star, Calendar, ShieldCheck, ArrowUpRight, Sparkles, Video, Wallet, Loader2,
  Banknote} from 'lucide-react'
import { formatCompactCount } from '@/lib/utils/helpers'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    profileViews: 0,
    reviews: 0,
    bookings: 0,
    saved: 0,
  })
  const [loading, setLoading] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState<string>('client')
  const [isAvailable, setIsAvailable] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchUserData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      // Real tables: profiles (role, display_name, view_count),
      // provider_presence (is_available), connections, reviews.
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, role, view_count')
        .eq('id', user.id)
        .maybeSingle()

      const role = profile?.role ?? user.user_metadata?.role ?? 'client'
      const name =
        profile?.display_name ||
        user.user_metadata?.full_name ||
        user.email?.split('@')[0] ||
        'Member'

      setUserRole(role)
      setUserName(name)

      if (role === 'model') {
        // Availability lives in provider_presence.
        const { data: presence } = await supabase
          .from('provider_presence')
          .select('is_available')
          .eq('provider_id', user.id)
          .maybeSingle()
        setIsAvailable(presence?.is_available ?? true)

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

        setStats({
          profileViews: profile?.view_count ?? 0,
          reviews: reviewsCount ?? 0,
          bookings: bookingsCount ?? 0,
          saved: 0,
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

        setStats({
          profileViews: 0,
          reviews: 0,
          bookings: clientBookingsCount ?? 0,
          saved: savedCount ?? 0,
        })
      }

      setLoading(false)
    }

    fetchUserData()
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
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#AC244D] border-t-transparent"></div>
          <p className="mt-3 text-sm font-medium text-neutral-500 tracking-wide font-sans">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  const isModel = userRole === 'model'

  return (
    <div className="max-w-5xl mx-auto space-y-8 font-sans">

      {/* Top Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-neutral-200/80 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-widest font-semibold text-[#AC244D]">
              {isModel ? 'Companion Control Panel' : 'VIP Member Account'}
            </span>
            <span className="text-neutral-300">•</span>
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
              <ShieldCheck className="h-3.5 w-3.5 text-[#AC244D]" /> Securely Verified
            </span>
          </div>
          <h1 className="text-3xl font-serif font-normal text-neutral-900 tracking-tight">
            Welcome back, {userName}
          </h1>
        </div>

        <div>
          {isModel ? (
            <div className="flex items-center bg-white border border-neutral-200/85 rounded-full px-4 py-2 shadow-xs">
              <span className="text-xs font-medium text-neutral-600 mr-3">Status:</span>
              <button
                onClick={handleToggleAvailability}
                disabled={updatingStatus}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full transition-colors ${
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
              className="inline-flex items-center justify-center bg-[#AC244D] hover:bg-[#8F1D40] text-white text-sm font-medium px-5 py-2.5 rounded-full transition-all shadow-xs"
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
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Profile Views</span>
                <Eye className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{formatCompactCount(stats.profileViews)}</p>
              <p className="text-xs text-neutral-400 mt-1">Total public directory visits</p>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Reviews</span>
                <Star className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.reviews}</p>
              <p className="text-xs text-neutral-400 mt-1">Verified client feedback</p>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Active Connections</span>
                <Calendar className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.bookings}</p>
              <p className="text-xs text-neutral-400 mt-1">Clients you are chatting with</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-6 shadow-xs">
              <h3 className="font-serif text-lg text-neutral-900 mb-4">Quick Management</h3>
              <div className="space-y-2">
                <Link href="/profile" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Edit Public Listing & Photos</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/models/live" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Broadcast Live Show</span>
                  <Video className="h-4 w-4 text-[#AC244D]" />
                </Link>
              </div>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-6 shadow-xs">
              <h3 className="font-serif text-lg text-neutral-900 mb-4">Bookings & Earnings</h3>
              <div className="space-y-2">
                <Link href="/bookings" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Manage Bookings</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/wallet" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Wallet & Payouts</span>
                  <Wallet className="h-4 w-4 text-[#AC244D]" />
                </Link>
                <Link href="/earnings" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Gift Earnings & Cash Out</span>
                  <Banknote className="h-4 w-4 text-[#AC244D]" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= CLIENT VIEW ================= */
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Connections</span>
                <Calendar className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.bookings}</p>
              <p className="text-xs text-neutral-400 mt-1">Active companion chats</p>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Wallet Balance</span>
                <Wallet className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">₦0</p>
              <p className="text-xs text-neutral-400 mt-1">Available funds</p>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Saved</span>
                <Sparkles className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.saved}</p>
              <p className="text-xs text-neutral-400 mt-1">Favorite companions</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-6 shadow-xs">
              <h3 className="font-serif text-lg text-neutral-900 mb-4">Explore Intima</h3>
              <div className="space-y-2">
                <Link href="/" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Browse All Verified Companions</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/bookings" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">View Booking History</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
              </div>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 sm:p-6 shadow-xs">
              <h3 className="font-serif text-lg text-neutral-900 mb-4">Account Settings</h3>
              <div className="space-y-2">
                <Link href="/profile" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Edit Profile & Contact Info</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/wallet" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Fund Wallet / Payments</span>
                  <Wallet className="h-4 w-4 text-[#AC244D]" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
