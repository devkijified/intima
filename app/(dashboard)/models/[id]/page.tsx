'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Star, MapPin, Calendar, Phone, Video, UserPlus, CheckCircle2 } from 'lucide-react'
import { formatPrice, getInitials } from '@/lib/utils/helpers'
import { useCall } from '@/components/calls/CallProvider'
import { RequestConnectionModal } from '@/components/connections/RequestConnectionModal'

interface ModelProfile {
  id: string
  display_name: string
  age: number
  city: string
  state: string
  rate_per_hour: number
  bio: string
  rating_avg: number
  review_count: number
  is_available: boolean
  profile_id: string
  profiles: {
    full_name: string
    avatar_url: string
    phone: string
  }
}

export default function ModelDetailPage() {
  const params = useParams()
  const [model, setModel] = useState<ModelProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [connected, setConnected] = useState(false)
  const supabase = createClient()
  const { startCall } = useCall()
  const canCall = Boolean(model?.profile_id)
  const callsDisabledCopy = 'Available after verification launch'

  useEffect(() => {
    async function fetchModel() {
      const { data, error } = await supabase
        .from('model_profiles')
        .select(`
          *,
          profiles:profile_id (
            full_name,
            avatar_url,
            phone
          )
        `)
        .eq('id', params.id)
        .single()

      if (!error && data) {
        setModel(data)
      }
      setLoading(false)
    }

    fetchModel()
  }, [params.id, supabase])

  useEffect(() => {
    async function checkConnection() {
      if (!model?.profile_id) return
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        const { data, error } = await supabase
          .from('connections')
          .select('id')
          .eq('client_id', user.id)
          .eq('provider_id', model.profile_id)
          .eq('status', 'active')
          .maybeSingle()
        // Fail open: on any error we still show the request button.
        if (!error && data) setConnected(true)
      } catch {
        /* fail open to the request button */
      }
    }

    checkConnection()
  }, [model?.profile_id, supabase])

  if (loading) {
    return <div className="text-center py-10">Loading model profile...</div>
  }

  if (!model) {
    return <div className="text-center py-10 text-gray-600">Model not found</div>
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-shrink-0">
              <div className="h-32 w-32 rounded-full bg-pink-100 flex items-center justify-center text-[#AC244D] font-bold text-3xl">
                {model.profiles?.avatar_url ? (
                  <img
                    src={model.profiles.avatar_url}
                    alt={model.display_name}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  getInitials(model.display_name)
                )}
              </div>
            </div>
            
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">
                {model.display_name}, {model.age}
              </h1>
              <div className="flex items-center gap-2 text-gray-600 mt-1">
                <MapPin className="h-4 w-4" />
                <span>{model.city}, {model.state}</span>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1">
                  <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  <span className="font-medium">{model.rating_avg || 'New'}</span>
                  <span className="text-gray-500">({model.review_count} reviews)</span>
                </div>
                <div className="text-lg font-bold text-[#AC244D]">
                  {formatPrice(model.rate_per_hour)}/hr
                </div>
              </div>
              <p className="mt-4 text-gray-600">{model.bio}</p>
              
              <div className="mt-6 flex flex-wrap gap-3">
                <Button className="bg-[#AC244D] hover:bg-[#8F1D40]">
                  <Calendar className="mr-2 h-4 w-4" />
                  Book Now
                </Button>
                {connected ? (
                  <Button variant="outline" disabled className="border-green-300 text-green-700">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Connected
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    disabled={!canCall}
                    title={canCall ? 'Request a connection' : callsDisabledCopy}
                    onClick={() => setShowConnectModal(true)}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Request connection
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={!canCall}
                  title={canCall ? 'Start a voice call' : callsDisabledCopy}
                  onClick={() => {
                    if (model.profile_id) void startCall(model.profile_id, model.display_name, 'voice')
                  }}
                >
                  <Phone className="mr-2 h-4 w-4" />
                  Voice call
                </Button>
                <Button
                  variant="outline"
                  disabled={!canCall}
                  title={canCall ? 'Start a video call' : callsDisabledCopy}
                  onClick={() => {
                    if (model.profile_id) void startCall(model.profile_id, model.display_name, 'video')
                  }}
                >
                  <Video className="mr-2 h-4 w-4" />
                  Video call
                </Button>
                <Button variant="outline">
                  <Phone className="mr-2 h-4 w-4" />
                  Contact
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      {showConnectModal && model.profile_id && (
        <RequestConnectionModal
          providerId={model.profile_id}
          providerName={model.display_name}
          providerAvatarUrl={model.profiles?.avatar_url}
          onClose={() => setShowConnectModal(false)}
          onConnected={() => {
            setConnected(true)
            setShowConnectModal(false)
          }}
        />
      )}
    </div>
  )
}
