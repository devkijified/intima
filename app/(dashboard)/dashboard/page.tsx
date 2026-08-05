'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Users, Star, Eye, Video } from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    profileViews: 0,
    reviews: 0,
    liveShows: 0,
    bookings: 0,
  })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchStats() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get model profile
      const { data: model } = await supabase
        .from('model_profiles')
        .select('view_count')
        .eq('user_id', user.id)
        .single()

      // Get reviews
      const { data: reviews } = await supabase
        .from('reviews')
        .select('id')
        .eq('model_id', model?.id)

      setStats({
        profileViews: model?.view_count || 0,
        reviews: reviews?.length || 0,
        liveShows: 0,
        bookings: 0,
      })
      setLoading(false)
    }

    fetchStats()
  }, [supabase])

  if (loading) {
    return <div className="text-center py-10">Loading dashboard...</div>
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Eye className="h-6 w-6 text-brand" />}
          title="Profile Views"
          value={stats.profileViews}
        />
        <StatCard
          icon={<Star className="h-6 w-6 text-brand" />}
          title="Reviews"
          value={stats.reviews}
        />
        <StatCard
          icon={<Video className="h-6 w-6 text-brand" />}
          title="Live Shows"
          value={stats.liveShows}
        />
        <StatCard
          icon={<Users className="h-6 w-6 text-brand" />}
          title="Bookings"
          value={stats.bookings}
        />
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4 flex-wrap">
            <button className="rounded-lg bg-brand px-4 py-2 text-white hover:bg-brand-dark">
              Go Live
            </button>
            <button className="rounded-lg border-2 border-brand px-4 py-2 text-brand hover:bg-brand hover:text-white">
              Edit Profile
            </button>
            <button className="rounded-lg border-2 border-gray-300 px-4 py-2 text-gray-600 hover:bg-gray-100">
              View Bookings
            </button>
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
        <div className="rounded-full bg-brand-muted p-3">{icon}</div>
      </CardContent>
    </Card>
  )
}
