import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Star, MapPin } from 'lucide-react'
import { formatPrice, getInitials } from '@/lib/utils/helpers'

interface ModelCardProps {
  model: {
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
      avatar_url: string
    }
  }
}

export function ModelCard({ model }: ModelCardProps) {
  return (
    <Link href={`/models/${model.id}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 flex-shrink-0 rounded-full bg-pink-100 flex items-center justify-center text-[#AC244D] font-bold text-xl">
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
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  {model.display_name}, {model.age}
                </h3>
                <Badge variant={model.is_available ? 'success' : 'secondary'}>
                  {model.is_available ? 'Available' : 'Busy'}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin className="h-3 w-3" />
                <span>{model.city}, {model.state}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-medium">{model.rating_avg || 'New'}</span>
                <span className="text-sm text-gray-500">
                  ({model.review_count} reviews)
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm text-gray-600 line-clamp-2">{model.bio}</p>
                <p className="font-bold text-[#AC244D]">
                  {formatPrice(model.rate_per_hour)}/hr
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
