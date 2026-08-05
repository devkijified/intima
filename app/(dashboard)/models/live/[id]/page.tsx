'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Video, Users, Heart, Share2 } from 'lucide-react'

export default function LiveStreamPage() {
  const params = useParams()
  const [loading, setLoading] = useState(true)
  const [streamData, setStreamData] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchStream() {
      const { data, error } = await supabase
        .from('live_sessions')
        .select(`
          *,
          model_profiles (
            display_name,
            city,
            profiles (avatar_url)
          )
        `)
        .eq('id', params.id)
        .eq('status', 'live')
        .single()

      if (!error && data) {
        setStreamData(data)
      }
      setLoading(false)
    }

    fetchStream()
  }, [params.id, supabase])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#AC244D] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading stream...</p>
        </div>
      </div>
    )
  }

  if (!streamData) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Video className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">Stream Not Found</h2>
          <p className="text-gray-600 mt-2">This stream may have ended or is not available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Video Player */}
      <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white">
            <Video className="h-20 w-20 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Stream Player</p>
            <p className="text-sm opacity-75">(Mux integration coming soon)</p>
          </div>
        </div>
        
        {/* Live Badge */}
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 px-3 py-1 rounded-full">
          <div className="h-2 w-2 bg-white rounded-full animate-pulse"></div>
          <span className="text-white text-sm font-medium">LIVE</span>
        </div>

        {/* Stream Info Overlay */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold">
              {streamData.model_profiles?.display_name?.[0] || 'M'}
            </div>
            <div>
              <p className="text-white font-medium">
                {streamData.model_profiles?.display_name || 'Model'}
              </p>
              <p className="text-white/70 text-sm">
                {streamData.model_profiles?.city || 'Unknown'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-white/80">
            <Users className="h-4 w-4" />
            <span className="text-sm">{streamData.viewer_count || 0} watching</span>
          </div>
        </div>
      </div>

      {/* Stream Actions */}
      <div className="mt-6 flex flex-wrap gap-4">
        <Button className="bg-[#AC244D] hover:bg-[#8F1D40] flex-1">
          <Heart className="mr-2 h-4 w-4" />
          Send Tip
        </Button>
        <Button variant="outline">
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>
      </div>

      {/* Stream Details */}
      <Card className="mt-6">
        <CardContent className="p-6">
          <h2 className="text-xl font-bold text-gray-900">
            {streamData.title || 'Live Stream'}
          </h2>
          <p className="text-gray-600 mt-2">
            {streamData.model_profiles?.display_name || 'Model'} is live from {streamData.model_profiles?.city || 'unknown location'}
          </p>
          {streamData.price_per_minute && (
            <p className="text-sm text-[#AC244D] font-medium mt-2">
              ₦{streamData.price_per_minute}/minute
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
