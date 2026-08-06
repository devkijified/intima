'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Eye, Star, Video, Calendar, User, ShieldCheck, Sparkles, ArrowUpRight, Radio, Heart } from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    profileViews: 0,
    reviews: 0,
    liveShows: 0,
    bookings: 0,
  })
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchStats() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .single()

      if (profile) {
        setUserName(profile.full_name || user.email?.split('@')[0] || 'User')
        setUserRole(profile.role || 'client')
      }

      // Get model profile if user is a model
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
        liveShows: 0,
        bookings: 0,
      })
      setLoading(false)
    }

    fetchStats()
  }, [supabase])

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#AC244D] mx-auto"></div>
          <p className="mt-4 text-slate-400 font-medium tracking-wide">Loading your sanctuary...</p>
        </div>
      </div>
    )
  }

  const isModel = userRole === 'model'

  return (
    <div className="space-y-8 pb-12">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#AC244D]/20 p-8 border border-slate-800 shadow-2xl">
        <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-[#AC244D]/10 blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#AC244D]/20 text-[#AC244D] border border-[#AC244D]/30">
                <Sparkles className="h-3 w-3" /> {isModel ? 'Verified Companion' : 'VIP Member'}
              </span>
              {isModel && (
                <button 
                  onClick={() => setIsOnline(!isOnline)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  {isOnline ? 'Online & Available' : 'Offline'}
                </button>
              )}
            </div>
            <h1 className="text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
              Welcome back, {userName}
            </h1>
            <p className="text-slate-400 mt-1 max-w-xl text-sm lg:text-base">
              {isModel 
                ? 'Your platform presence is active. Check your live requests and client connections below.' 
                : 'Explore verified independent companions, book private sessions, and curate your experiences.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isModel ? (
              <Link href="/models/live">
                <Button className="bg-[#AC244D] hover:bg-[#8F1D40] text-white shadow-lg shadow-[#AC244D]/25 rounded-xl px-5 py-6">
                  <Radio className="mr-2 h-4 w-4 animate-pulse" />
                  Start Live Show
                </Button>
              </Link>
            ) : (
              <Link href="/models">
                <Button className="bg-[#AC244D] hover:bg-[#8F1D40] text-white shadow-lg shadow-[#AC244D]/25 rounded-xl px-5 py-6">
                  <Heart className="mr-2 h-4 w-4" />
                  Explore Companions
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          icon={<Eye className="h-5 w-5 text-[#AC244D]" />} 
          title="Profile Views" 
          value={stats.profileViews} 
          trend="+12% this week"
        />
        <StatCard 
          icon={<Star className="h-5 w-5 text-[#AC244D]" />} 
          title="Reviews & Ratings" 
          value={stats.reviews} 
          trend="4.9 Overall"
        />
        <StatCard 
          icon={<Video className="h-5 w-5 text-[#AC244D]" />} 
          title="Live Shows" 
          value={stats.liveShows} 
          trend="0 scheduled"
        />
        <StatCard 
          icon={<Calendar className="h-5 w-5 text-[#AC244D]" />} 
          title="Bookings" 
          value={stats.bookings} 
          trend="Active requests"
        />
      </div>

      {/* Action Sections */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Quick Actions */}
        <Card className="md:col-span-1 bg-slate-900/60 border-slate-800/80 backdrop-blur-xl rounded-2xl shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-white text-lg font-semibold flex items-center gap-2">
              Quick Shortcuts
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link href="/profile" className="w-full group">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-all text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#AC244D]/10 text-[#AC244D]">
                    <User className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">Edit Profile & Gallery</span>
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-white transition-colors" />
              </div>
            </Link>

            <Link href="/bookings" className="w-full group">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-all text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#AC244D]/10 text-[#AC244D]">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">Manage Bookings</span>
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-white transition-colors" />
              </div>
            </Link>

            <Link href="/safety" className="w-full group">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-all text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">Verification Center</span>
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-white transition-colors" />
              </div>
            </Link>
          </CardContent>
        </Card>

        {/* Recent Activity Feed */}
        <Card className="md:col-span-2 bg-slate-900/60 border-slate-800/80 backdrop-blur-xl rounded-2xl shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-white text-lg font-semibold">Recent Activity & Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/30">
              <div className="rounded-full bg-slate-800/80 p-4 mb-3 text-slate-400">
                <Calendar className="h-6 w-6" />
              </div>
              <p className="text-slate-300 font-medium">No recent platform activities yet</p>
              <p className="text-slate-500 text-xs mt-1 max-w-xs">
                {isModel 
                  ? 'Your upcoming sessions, reviews, and client chats will show up here.' 
                  : 'Start exploring verified profiles to book your first experience.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ icon, title, value, trend }: { icon: React.ReactNode; title: string; value: number; trend: string }) {
  return (
    <Card className="bg-slate-900/60 border-slate-800/80 backdrop-blur-xl rounded-2xl shadow-lg hover:border-slate-700 transition-all">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <div className="rounded-xl bg-[#AC244D]/10 p-2.5 border border-[#AC244D]/20">{icon}</div>
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
          <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            {trend}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
