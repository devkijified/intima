'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Users, UserCheck, UserX, Video, Star } from 'lucide-react'

export default function AdminPage() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalModels: 0,
    pendingVerifications: 0,
    totalReviews: 0,
  })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchStats() {
      try {
        const { count: usersCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })

        const { count: modelsCount } = await supabase
          .from('model_profiles')
          .select('*', { count: 'exact', head: true })

        const { count: pendingCount } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('is_verified', false)
          .eq('role', 'model')

        const { count: reviewsCount } = await supabase
          .from('reviews')
          .select('*', { count: 'exact', head: true })

        setStats({
          totalUsers: usersCount || 0,
          totalModels: modelsCount || 0,
          pendingVerifications: pendingCount || 0,
          totalReviews: reviewsCount || 0,
        })
      } catch (error) {
        console.error('Error fetching stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [supabase])

  if (loading) {
    return <div className="text-center py-10">Loading admin dashboard...</div>
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Dashboard</h1>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard icon={<Users className="h-6 w-6 text-[#AC244D]" />} title="Total Users" value={stats.totalUsers} />
        <StatCard icon={<UserCheck className="h-6 w-6 text-[#AC244D]" />} title="Total Models" value={stats.totalModels} />
        <StatCard icon={<UserX className="h-6 w-6 text-yellow-500" />} title="Pending Verifications" value={stats.pendingVerifications} />
        <StatCard icon={<Star className="h-6 w-6 text-[#AC244D]" />} title="Total Reviews" value={stats.totalReviews} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full justify-start">
              <UserCheck className="mr-2 h-4 w-4" />
              Verify Models
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <Users className="mr-2 h-4 w-4" />
              Manage Users
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <Video className="mr-2 h-4 w-4" />
              Monitor Live Streams
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">No recent activity to display</p>
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
