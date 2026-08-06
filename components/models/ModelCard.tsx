'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { 
  Star, 
  MapPin, 
  Heart, 
  Shield, 
  Sparkles,
  Clock,
  MessageCircle,
  Camera
} from 'lucide-react'
import { formatPrice, getInitials } from '@/lib/utils/helpers'
import { useState } from 'react'

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
    is_verified?: boolean
    is_new?: boolean
    is_featured?: boolean
    profile_id: string
    profiles: {
      avatar_url: string
    }
    specialties?: string[]
    languages?: string[]
  }
}

export function ModelCard({ model }: ModelCardProps) {
  const [isLiked, setIsLiked] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Default values for demo
  const isVerified = model.is_verified ?? Math.random() > 0.3
  const isNew = model.is_new ?? Math.random() > 0.7
  const isFeatured = model.is_featured ?? Math.random() > 0.85
  const specialties = model.specialties ?? ['Massage', 'Dinner Date', 'Travel Companion'].slice(0, Math.floor(Math.random() * 3) + 1)
  const languages = model.languages ?? ['English']

  return (
    <Link href={`/models/${model.id}`}>
      <Card className="group overflow-hidden hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 bg-white border-0 rounded-2xl h-full">
        {/* Image Container - Portrait ratio like Tryst */}
        <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-pink-100 to-rose-100">
          {/* Image */}
          {model.profiles?.avatar_url ? (
            <>
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
              )}
              <img
                src={model.profiles.avatar_url}
                alt={`${model.display_name} - ${model.age} year old companion`}
                className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                onLoad={() => setImageLoaded(true)}
                loading="lazy"
              />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl font-bold text-primary/30 bg-gradient-to-br from-primary-muted to-secondary-muted">
              {getInitials(model.display_name)}
            </div>
          )}

          {/* Status Badges - Top Left */}
          <div className="absolute top-4 left-4 flex flex-col gap-2">
            {isVerified && (
              <div className="bg-primary/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-lg">
                <Shield className="w-3 h-3" />
                Verified
              </div>
            )}
            
            {isNew && (
              <div className="bg-secondary/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-lg">
                <Sparkles className="w-3 h-3" />
                New
              </div>
            )}

            {isFeatured && (
              <div className="bg-amber-500/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-lg">
                <Star className="w-3 h-3 fill-white" />
                Featured
              </div>
            )}
          </div>

          {/* Availability Badge - Top Right */}
          <div className="absolute top-4 right-4">
            {model.is_available ? (
              <div className="bg-green-500/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-lg">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                Available Now
              </div>
            ) : (
              <div className="bg-gray-500/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium shadow-lg">
                <Clock className="w-3 h-3 inline mr-1" />
                Offline
              </div>
            )}
          </div>

          {/* Rate Badge - Bottom Right */}
          <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg border border-white/20">
            <p className="text-sm font-bold text-primary">
              {formatPrice(model.rate_per_hour)}
              <span className="text-gray-500 font-normal text-xs ml-0.5">/hr</span>
            </p>
          </div>

          {/* Quick Action - Heart (Favourite) */}
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsLiked(!isLiked)
            }}
            className="absolute bottom-4 left-4 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full 
                     flex items-center justify-center hover:bg-primary hover:text-white 
                     transition-all duration-300 shadow-lg group-hover:scale-110"
            aria-label={isLiked ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Heart 
              className={`w-5 h-5 transition-colors ${
                isLiked ? 'fill-red-500 text-red-500' : 'text-gray-600'
              }`} 
            />
          </button>

          {/* Photo Count Badge - Bottom Center */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5">
            <Camera className="w-3 h-3" />
            {Math.floor(Math.random() * 8) + 3} photos
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-charcoal truncate">
                {model.display_name}, {model.age}
              </h3>
              <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{model.city}, {model.state}</span>
              </div>
            </div>
            
            {/* Rating */}
            <div className="flex items-center gap-1 bg-secondary-muted px-2.5 py-1 rounded-full ml-2 flex-shrink-0">
              <Star className="w-3.5 h-3.5 fill-secondary text-secondary" />
              <span className="text-sm font-semibold">
                {model.rating_avg ? model.rating_avg.toFixed(1) : 'New'}
              </span>
              {model.review_count > 0 && (
                <span className="text-xs text-gray-500">({model.review_count})</span>
              )}
            </div>
          </div>

          {/* Bio - Truncated */}
          <p className="mt-2 text-sm text-gray-600 line-clamp-2 leading-relaxed">
            {model.bio || 'A sophisticated companion ready to make your experience unforgettable.'}
          </p>

          {/* Tags */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {specialties.slice(0, 3).map((specialty, idx) => (
              <span 
                key={idx} 
                className="text-xs bg-primary-muted text-primary px-2.5 py-1 rounded-full font-medium"
              >
                {specialty}
              </span>
            ))}
            {languages.slice(0, 2).map((lang, idx) => (
              <span 
                key={idx} 
                className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full"
              >
                {lang}
              </span>
            ))}
            {specialties.length > 3 && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                +{specialties.length - 3} more
              </span>
            )}
          </div>

          {/* Quick Action Buttons */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Responds in minutes</span>
              <span className="sm:hidden">Quick reply</span>
            </span>
            <button 
              className="text-sm font-medium text-primary hover:text-primary-dark transition-colors flex items-center gap-1"
              onClick={(e) => {
                e.preventDefault()
                // Navigate to profile
              }}
            >
              View Profile
              <span className="text-xs">→</span>
            </button>
          </div>
        </div>
      </Card>
    </Link>
  )
}
