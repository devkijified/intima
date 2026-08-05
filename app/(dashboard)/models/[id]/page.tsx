'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Star, MapPin, Calendar, Phone } from 'lucide-react'
import { formatPrice, getInitials } from '@/lib/utils/helpers'

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
  const supabase = createClient()

  useEffect(() => {
    async function fetchModel() {
      const { data, error } = await supabase
        .from('model_profiles')
        .select(`
          *,
          profiles:user_id (
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
                <Button variant="outline">
                  <Phone className="mr-2 h-4 w-4" />
                  Contact
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
