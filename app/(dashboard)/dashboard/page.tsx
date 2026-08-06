'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Eye, Star, Video, Calendar, User } from 'lucide-react'

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
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#AC244D] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {userName}! 👋
        </h1>
        <p className="text-gray-600 mt-1">
          {userRole === 'model' ? 'Manage your profile and connect with clients' : 'Discover verified companions in Nigeria'}
        </p>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Eye className="h-6 w-6 text-[#AC244D]" />} title="Profile Views" value={stats.profileViews} />
        <StatCard icon={<Star className="h-6 w-6 text-[#AC244D]" />} title="Reviews" value={stats.reviews} />
        <StatCard icon={<Video className="h-6 w-6 text-[#AC244D]" />} title="Live Shows" value={stats.liveShows} />
        <StatCard icon={<Calendar className="h-6 w-6 text-[#AC244D]" />} title="Bookings" value={stats.bookings} />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link href="/models/live" className="w-full">
              <Button className="bg-[#AC244D] hover:bg-[#8F1D40] w-full">
                <Video className="mr-2 h-4 w-4" />
                Go Live
              </Button>
            </Link>
            <Link href="/profile" className="w-full">
              <Button variant="outline" className="w-full">
                <User className="mr-2 h-4 w-4" />
                Edit Profile
              </Button>
            </Link>
            <Link href="/bookings" className="w-full">
              <Button variant="outline" className="w-full">
                <Calendar className="mr-2 h-4 w-4" />
                View Bookings
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-gray-500 py-8">
              No recent activity yet. Start exploring!
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ icon, title, value }: { icon: React.ReactNode; title: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-6">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className="rounded-full bg-pink-50 p-3">{icon}</div>
      </CardContent>
    </Card>
  )
}
