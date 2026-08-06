'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, Star, Calendar, UserCheck, ShieldCheck, ArrowUpRight, Sparkles, Sliders, MessageSquare } from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    profileViews: 0,
    reviews: 0,
    bookings: 0,
  })
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState<'model' | 'client'>('client')
  const [isAvailable, setIsAvailable] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchUserData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .single()

      const role = (profile?.role as 'model' | 'client') || 'client'
      setUserName(profile?.full_name || user.email?.split('@')[0] || 'Member')
      setUserRole(role)

      if (role === 'model') {
        const { data: model } = await supabase
          .from('model_profiles')
          .select('id, view_count')
          .eq('profile_id', user.id)
          .single()

        let reviewsCount = 0
        if (model?.id) {
          const { count } = await supabase
            .from('reviews')
            .select('*', { count: 'exact', head: true })
            .eq('model_id', model.id)
          reviewsCount = count || 0
        }

        setStats({
          profileViews: model?.view_count || 0,
          reviews: reviewsCount,
          bookings: 0,
        })
      }
      setLoading(false)
    }

    fetchUserData()
  }, [supabase])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#FDF9F6]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#AC244D] border-t-transparent"></div>
          <p className="mt-3 text-sm font-medium text-neutral-500 tracking-wide font-sans">Loading your account...</p>
        </div>
      </div>
    )
  }

  const isModel = userRole === 'model'

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 font-sans">
      
      {/* Top Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-neutral-200/80 pb-6 mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-widest font-semibold text-[#AC244D]">
              {isModel ? 'Companion Control Panel' : 'Client Member Area'}
            </span>
            <span className="text-neutral-300">•</span>
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
              <ShieldCheck className="h-3.5 w-3.5 text-[#AC244D]" /> Verified Account
            </span>
          </div>
          <h1 className="text-3xl font-serif font-normal text-neutral-900 tracking-tight">
            Welcome back, {userName}
          </h1>
        </div>

        {/* Role-Specific Quick Toggle / CTA */}
        <div className="flex items-center gap-3">
          {isModel ? (
            <div className="flex items-center bg-white border border-neutral-200 rounded-full px-4 py-2 shadow-sm">
              <span className="text-xs font-medium text-neutral-600 mr-3">Availability Status:</span>
              <button 
                onClick={() => setIsAvailable(!isAvailable)}
                className={`flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                  isAvailable ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
                {isAvailable ? 'Available Now' : 'Offline'}
              </button>
            </div>
          ) : (
            <Link 
              href="/models/browse" 
              className="inline-flex items-center justify-center bg-[#AC244D] hover:bg-[#8F1D40] text-white text-sm font-medium px-5 py-2.5 rounded-full transition-all shadow-sm"
            >
              Browse Companions
            </Link>
          )}
        </div>
      </div>

      {/* CONDITIONAL DASHBOARD CONTENT BASED ON ACCOUNT TYPE */}
      {isModel ? (
        /* ================= COMPANION / MODEL VIEW ================= */
        <div className="space-y-8">
          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Profile Views</span>
                <Eye className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.profileViews}</p>
              <p className="text-xs text-neutral-400 mt-1">Total visits to your public profile</p>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Reviews & Ratings</span>
                <Star className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.reviews}</p>
              <p className="text-xs text-neutral-400 mt-1">Verified client feedback</p>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Pending Bookings</span>
                <Calendar className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">{stats.bookings}</p>
              <p className="text-xs text-neutral-400 mt-1">Requests requiring action</p>
            </div>
          </div>

          {/* Management Shortcuts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm">
              <h3 className="font-serif text-lg text-neutral-900 mb-4">Profile Management</h3>
              <div className="space-y-2">
                <Link href="/profile" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Edit Public Listing & Gallery</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/profile/rates" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Manage Rates & Services</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/profile/verification" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Verification Status & Badges</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
              </div>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm">
              <h3 className="font-serif text-lg text-neutral-900 mb-4">Client Interactions</h3>
              <div className="space-y-2">
                <Link href="/bookings" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">View Booking Requests</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/messages" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Direct Messages</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= CLIENT VIEW ================= */
        <div className="space-y-8">
          {/* Quick Info Grid for Clients */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Active Bookings</span>
                <Calendar className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">0</p>
              <p className="text-xs text-neutral-400 mt-1">Confirmed appointments</p>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Saved Profiles</span>
                <Sparkles className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">0</p>
              <p className="text-xs text-neutral-400 mt-1">Your favorite companions</p>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-neutral-500 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Messages</span>
                <MessageSquare className="h-4 w-4 text-[#AC244D]" />
              </div>
              <p className="text-3xl font-serif text-neutral-900">0</p>
              <p className="text-xs text-neutral-400 mt-1">Unread conversations</p>
            </div>
          </div>

          {/* Client Navigation Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm">
              <h3 className="font-serif text-lg text-neutral-900 mb-4">Explore Intima</h3>
              <div className="space-y-2">
                <Link href="/models/browse" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Browse All Verified Companions</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/bookings" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">View My Booking History</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
              </div>
            </div>

            <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm">
              <h3 className="font-serif text-lg text-neutral-900 mb-4">Account Settings</h3>
              <div className="space-y-2">
                <Link href="/profile" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Edit Personal Information</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
                <Link href="/safety" className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-all text-neutral-700">
                  <span className="text-sm font-medium">Safety & Verification Guidelines</span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
