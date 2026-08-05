'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Eye, Star, Video, Calendar } from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    profileViews: 0,
    reviews: 0,
    liveShows: 0,
    bookings: 0,
  })
  const [loading, setLoading] = useState(true)
  const [modelId, setModelId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchStats() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      // Get model profile
      const { data: model, error: modelError } = await supabase
        .from('model_profiles')
        .select('id, view_count')
        .eq('profile_id', user.id)
        .single()

      if (modelError) {
        console.error('Error fetching model:', modelError)
        setLoading(false)
        return
      }

      // Store model ID for later use
      setModelId(model?.id || null)

      // Get reviews count
      let reviewsCount = 0
      if (model?.id) {
        const { count, error: reviewsError } = await supabase
          .from('reviews')
          .select('*', { count: 'exact', head: true })
          .eq('model_id', model.id)

        if (!reviewsError) {
          reviewsCount = count || 0
        }
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
    return <div className="text-center py-10">Loading dashboard...</div>
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Eye className="h-6 w-6 text-[#AC244D]" />} title="Profile Views" value={stats.profileViews} />
        <StatCard icon={<Star className="h-6 w-6 text-[#AC244D]" />} title="Reviews" value={stats.reviews} />
        <StatCard icon={<Video className="h-6 w-6 text-[#AC244D]" />} title="Live Shows" value={stats.liveShows} />
        <StatCard icon={<Calendar className="h-6 w-6 text-[#AC244D]" />} title="Bookings" value={stats.bookings} />
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4 flex-wrap">
            <Button className="bg-[#AC244D] hover:bg-[#8F1D40]">Go Live</Button>
            <Button variant="outline">Edit Profile</Button>
            <Button variant="outline">View Bookings</Button>
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
