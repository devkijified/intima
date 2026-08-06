'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Star, MapPin, Heart, Shield, Clock, Languages } from 'lucide-react'
import { formatPrice, getInitials } from '@/lib/utils/helpers'

interface ModelCardPremiumProps {
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
    is_verified: boolean
    languages: string[]
    specialties: string[]
    profile_id: string
    profiles: {
      avatar_url: string
    }
  }
}

export function ModelCardPremium({ model }: ModelCardPremiumProps) {
  return (
    <Link href={`/models/${model.id}`}>
      <Card className="group overflow-hidden hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 bg-white border-0 rounded-2xl">
        {/* Image Container */}
        <div className="relative h-72 overflow-hidden bg-gradient-to-br from-primary-muted to-secondary-muted">
          {model.profiles?.avatar_url ? (
            <img
              src={model.profiles.avatar_url}
              alt={model.display_name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl font-bold text-primary/30">
              {getInitials(model.display_name)}
            </div>
          )}

          {/* Status Badges */}
          <div className="absolute top-4 left-4 flex flex-col gap-2">
            {model.is_verified && (
              <div className="bg-primary/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Verified
              </div>
            )}
            {model.is_available ? (
              <div className="bg-green-500/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                Available
              </div>
            ) : (
              <div className="bg-red-500/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium">
                Busy
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <button className="absolute top-4 right-4 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full 
                           flex items-center justify-center hover:bg-primary hover:text-white 
                           transition-all duration-300 shadow-lg group-hover:scale-110">
            <Heart className="w-5 h-5" />
          </button>

          {/* Rate Badge */}
          <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg">
            <p className="text-sm font-bold text-primary">
              {formatPrice(model.rate_per_hour)}
              <span className="text-gray-500 font-normal text-xs"> /hr</span>
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-bold text-charcoal">
                {model.display_name}, {model.age}
              </h3>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                <MapPin className="w-4 h-4" />
                <span>{model.city}, {model.state}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-secondary-muted px-3 py-1 rounded-full">
              <Star className="w-4 h-4 fill-secondary text-secondary" />
              <span className="text-sm font-semibold">{model.rating_avg || 'New'}</span>
              <span className="text-xs text-gray-500">({model.review_count})</span>
            </div>
          </div>

          <p className="mt-3 text-sm text-gray-600 line-clamp-2">{model.bio}</p>

          {/* Tags */}
          <div className="mt-4 flex flex-wrap gap-2">
            {model.specialties?.slice(0, 3).map((specialty, idx) => (
              <span key={idx} className="text-xs bg-primary-muted text-primary px-3 py-1 rounded-full">
                {specialty}
              </span>
            ))}
            {model.languages?.slice(0, 2).map((lang, idx) => (
              <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full flex items-center gap-1">
                <Languages className="w-3 h-3" />
                {lang}
              </span>
            ))}
          </div>

          {/* View Profile Button */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button className="w-full text-center text-sm font-medium text-primary hover:text-primary-dark transition-colors">
              View Full Profile →
            </button>
          </div>
        </div>
      </Card>
    </Link>
  )
}
