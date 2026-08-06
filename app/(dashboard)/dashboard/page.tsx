'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, Star, Calendar, ShieldCheck, ArrowUpRight, Sparkles, Video, Wallet, Loader2 } from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    profileViews: 0,
    reviews: 0,
    bookings: 0,
  })
  const [loading, setLoading] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState<string>('client')
  const [modelId, setModelId] = useState<string | null>(null)
  const [isAvailable, setIsAvailable] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchUserData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      const metaRole = user.user_metadata?.role || user.app_metadata?.role
      const metaName = user.user_metadata?.full_name

      let role = metaRole || 'client'
      let name = metaName || user.email?.split('@')[0] || 'Member'

      // Check public.profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .single()

      if (profile) {
        if (profile.full_name) name = profile.full_name
        if (profile.role) role = profile.role
      }

      setUserRole(role)
      setUserName(name)

      if (role === 'model') {
        // Check if model_profiles record exists
        let { data: model } = await supabase
          .from('model_profiles')
          .select('id, view_count, is_available')
          .eq('profile_id', user.id)
          .single()

        // If companion profile doesn't exist yet, automatically create one so they aren't blocked
        if (!model) {
          const { data: newModel, error: insertError } = await supabase
            .from('model_profiles')
            .insert([
              {
                profile_id: user.id,
                display_name: name,
                city: 'Lagos', // Default fallback city
                is_available: true,
              }
            ])
            .select('id, view_count, is_available')
            .single()

          if (!insertError && newModel) {
            model = newModel
          }
        }

        if (model) {
          setModelId(model.id)
          setIsAvailable(model.is_available ?? true)

          const { count: reviewsCount } = await supabase
            .from('reviews')
            .select('*', { count: 'exact', head: true })
            .eq('model_id', model.id)

          const { count: bookingsCount } = await supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('model_id', model.id)
            .eq('status', 'pending')

          setStats({
            profileViews: model.view_count || 0,
            reviews: reviewsCount || 0,
            bookings: bookingsCount || 0,
          })
        }
      } else {
        const { count: clientBookingsCount } = await supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', user.id)

        setStats({
          profileViews: 0,
          reviews: 0,
          bookings: clientBookingsCount || 0,
        })
      }

      setLoading(false)
    }

    fetchUserData()
  }, [supabase])

  const handleToggleAvailability = async () => {
    if (!modelId) return

    const newStatus = !isAvailable
    setUpdatingStatus(true)
    setIsAvailable(newStatus)

    const { error } = await supabase
      .from('model_profiles')
      .update({ is_available: newStatus, updated_at: new Date().toISOString() })
      .eq('id', modelId)

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
              href="/models/browse" 
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-xs">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Profile Views</span>
                <Eye className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.profileViews}</p>
              <p className="text-xs text-neutral-400 mt-1">Total public directory visits</p>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-xs">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Reviews</span>
                <Star className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.reviews}</p>
              <p className="text-xs text-neutral-400 mt-1">Verified client feedback</p>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-xs">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Pending Bookings</span>
                <Calendar className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.bookings}</p>
              <p className="text-xs text-neutral-400 mt-1">Requires your response</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-xs">
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

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-xs">
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
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= CLIENT VIEW ================= */
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-xs">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Bookings</span>
                <Calendar className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.bookings}</p>
              <p className="text-xs text-neutral-400 mt-1">Confirmed appointments</p>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-xs">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Wallet Balance</span>
                <Wallet className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">₦0</p>
              <p className="text-xs text-neutral-400 mt-1">Available funds</p>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-xs">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Saved</span>
                <Sparkles className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">0</p>
              <p className="text-xs text-neutral-400 mt-1">Favorite companions</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-xs">
              <h3 className="font-serif text-lg text-neutral-900 mb-4">Explore Intima</h3>
              <div className="space-y-2">
                <Link href="/models/browse" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Browse All Verified Companions</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/bookings" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">View Booking History</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
              </div>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-xs">
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
