'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import {
  Star,
  MapPin,
  Heart,
  BadgeCheck,
  Sparkles,
  Clock,
  MessageCircle,
  Camera,
  Phone,
  Video,
  UserPlus
} from '@/lib/icons'
import { formatCompactPrice, getInitials } from '@/lib/utils/helpers'
import { useCall } from '@/components/calls/CallProvider'
import { RequestConnectionModal } from '@/components/connections/RequestConnectionModal'
import { useState } from 'react'
import { Tooltip } from '@/components/ui/Tooltip'

interface ModelCardProps {
  /** grid: tall portrait card. list: compact horizontal row card. */
  layout?: 'grid' | 'list'
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
    /** Provider row creation time; is_new derives from it (14 days). */
    created_at?: string
    profile_id: string
    /** Auth user id of the provider. Null for mock rows, which disables calls. */
    userId?: string | null
    profiles: {
      avatar_url: string
      gallery_urls?: string[] | null
    }
    specialties?: string[]
    languages?: string[]
  }
}

export function ModelCard({ model, layout = 'grid' }: ModelCardProps) {
  const [isLiked, setIsLiked] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [note, setNote] = useState('')
  const { startCall } = useCall()
  const canCall = Boolean(model.userId)
  const callsDisabledCopy = 'Available after verification launch'
  // Mock rows cannot be called or connected yet. The buttons stay
  // tappable and say why inline: a hard-disabled button fires nothing
  // and its only explanation was a hover tooltip, invisible on touch.
  const flashNote = (msg: string) => {
    setNote(msg)
    window.setTimeout(() => setNote(''), 3000)
  }

  // Every badge and tag binds to the provider row. Nothing here is
  // invented: unverified until the row says so, New only inside 14
  // days of created_at, tags only what she actually offers.
  const isVerified = model.is_verified ?? false
  const isNew = model.is_new ?? (model.created_at
    ? Date.now() - new Date(model.created_at).getTime() < 14 * 24 * 3600 * 1000
    : false)
  const isFeatured = model.is_featured ?? false
  const specialties = model.specialties ?? []
  const languages = model.languages ?? []
  // Photo count the same way the profile page builds its slides:
  // the gallery plus the avatar.
  const photoCount = (model.profiles?.gallery_urls?.filter(Boolean).length ?? 0)
    + (model.profiles?.avatar_url ? 1 : 0)

  const actionBtnCls = `w-11 h-11 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-500 hover:border-primary hover:text-primary transition-colors ${canCall ? '' : 'opacity-40'}`
  const voiceBtn = (
    <Tooltip label={canCall ? 'Start a voice call' : callsDisabledCopy}>
      <button
        title={canCall ? 'Start a voice call' : callsDisabledCopy}
        aria-label={canCall ? `Voice call ${model.display_name}` : callsDisabledCopy}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (model.userId) void startCall(model.userId, model.display_name, 'voice')
          else flashNote('Preview profile. Calls open at launch.')
        }}
        className={actionBtnCls}
      >
        <Phone aria-hidden className="w-4 h-4" />
      </button>
    </Tooltip>
  )
  const videoBtn = (
    <Tooltip label={canCall ? 'Start a video call' : callsDisabledCopy}>
      <button
        title={canCall ? 'Start a video call' : callsDisabledCopy}
        aria-label={canCall ? `Video call ${model.display_name}` : callsDisabledCopy}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (model.userId) void startCall(model.userId, model.display_name, 'video')
          else flashNote('Preview profile. Calls open at launch.')
        }}
        className={actionBtnCls}
      >
        <Video aria-hidden className="w-4 h-4" />
      </button>
    </Tooltip>
  )
  const connectBtn = (
    <Tooltip label={canCall ? 'Request a connection' : callsDisabledCopy}>
      <button
        title={canCall ? 'Request a connection' : callsDisabledCopy}
        aria-label={canCall ? `Request connection with ${model.display_name}` : callsDisabledCopy}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (model.userId) setShowConnectModal(true)
          else flashNote('Preview profile. Connections open at launch.')
        }}
        className={actionBtnCls}
      >
        <UserPlus aria-hidden className="w-4 h-4" />
      </button>
    </Tooltip>
  )
  const connectModal = showConnectModal && model.userId ? (
    <span
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <RequestConnectionModal
        providerId={model.userId}
        providerName={model.display_name}
        providerAvatarUrl={model.profiles?.avatar_url}
        onClose={() => setShowConnectModal(false)}
        onConnected={() => setShowConnectModal(false)}
      />
    </span>
  ) : null

  if (layout === 'list') {
    return (
      <Link href={`/companion/${model.id}`}>
        <Card className="relative flex h-[124px] items-stretch gap-3 overflow-hidden rounded-2xl border-0 bg-white p-2 shadow-sm transition-shadow hover:shadow-lg">
          {/* Square thumbnail: the photo (or its placeholder) never
              grows past this box, however long the card row is. */}
          <div className="relative aspect-square h-full shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-pink-100 to-rose-100">
            {model.profiles?.avatar_url ? (
              <img
                src={model.profiles.avatar_url}
                alt={`${model.display_name} - ${model.age} year old companion`}
                className={`h-full w-full object-cover transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setImageLoaded(true)}
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-muted to-secondary-muted text-2xl font-bold text-primary/30">
                {getInitials(model.display_name)}
              </div>
            )}
            {photoCount > 1 && (
              <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                <Camera aria-hidden className="h-2.5 w-2.5" />
                {photoCount}
              </span>
            )}
          </div>

          {/* Details: one tight stack, nothing wraps to a second line
              except by truncation. */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-[15px] font-bold leading-tight text-charcoal">
                {model.display_name}, {model.age}
              </h3>
              {isVerified && <BadgeCheck aria-hidden className="h-4 w-4 shrink-0 text-primary" />}
              {isNew && (
                <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                  New
                </span>
              )}
              <span className="ml-auto flex shrink-0 items-center gap-1">
                <Star aria-hidden className="h-3.5 w-3.5 fill-secondary text-secondary" />
                <span className="text-xs font-semibold text-charcoal">
                  {model.rating_avg ? model.rating_avg.toFixed(1) : 'New'}
                </span>
                {model.review_count > 0 && (
                  <span className="text-[11px] text-gray-500">({model.review_count})</span>
                )}
              </span>
            </div>

            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
              <MapPin aria-hidden className="h-3 w-3 shrink-0" />
              <span className="truncate">{model.city}, {model.state}</span>
              <span aria-hidden className="shrink-0">·</span>
              {model.is_available ? (
                <span className="flex shrink-0 items-center gap-1 font-medium text-emerald-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Available now
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 font-medium text-gray-400">
                  <Clock aria-hidden className="h-3 w-3" />
                  Offline
                </span>
              )}
            </p>

            <p className="mt-1 whitespace-nowrap text-sm font-bold leading-tight text-primary">
              {formatCompactPrice(model.rate_per_hour)}
              <span className="ml-1 text-xs font-medium text-gray-500">short time</span>
            </p>

            {/* Every action survives, one row, 44px targets. */}
            <div className="mt-auto flex items-center gap-2">
              <Tooltip label={isLiked ? 'Remove from favourites' : 'Add to favourites'}>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setIsLiked(!isLiked)
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 transition-colors hover:border-primary"
                  aria-label={isLiked ? 'Remove from favourites' : 'Add to favourites'}
                >
                  <Heart aria-hidden
                    className={`h-5 w-5 transition-colors ${
                      isLiked ? 'fill-red-500 text-red-500' : 'text-gray-600'
                    }`}
                  />
                </button>
              </Tooltip>
              {voiceBtn}
              {videoBtn}
              {connectBtn}
            </div>
          </div>

          {note && (
            <span className="absolute bottom-1 right-2 rounded-full bg-charcoal/85 px-2 py-0.5 text-[11px] text-white">
              {note}
            </span>
          )}
        </Card>
        {connectModal}
      </Link>
    )
  }

  return (
    <Link href={`/companion/${model.id}`}>
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
                <BadgeCheck aria-hidden className="w-3 h-3" />
                Verified
              </div>
            )}

            {isNew && (
              <div className="bg-secondary/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-lg">
                <Sparkles aria-hidden className="w-3 h-3" />
                New
              </div>
            )}

            {isFeatured && (
              <div className="bg-amber-500/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-lg">
                <Star aria-hidden className="w-3 h-3 fill-white" />
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
                <Clock aria-hidden className="w-3 h-3 inline mr-1" />
                Offline
              </div>
            )}
          </div>

          {/* Rate Badge - Bottom Right: compact, one line, never wraps */}
          <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-xl shadow-lg border border-white/20">
            <p className="whitespace-nowrap text-sm font-bold text-primary">
              {formatCompactPrice(model.rate_per_hour)}
              <span className="ml-1 text-xs font-medium text-gray-500">short time</span>
            </p>
          </div>

          {/* Quick Action - Heart (Favourite) */}
          <Tooltip label={isLiked ? 'Remove from favourites' : 'Add to favourites'} wrapperClassName="absolute bottom-4 left-4">
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsLiked(!isLiked)
            }}
            className="w-11 h-11 bg-white/90 backdrop-blur-sm rounded-full
                     flex items-center justify-center hover:bg-primary hover:text-white
                     transition-all duration-300 shadow-lg group-hover:scale-110"
            aria-label={isLiked ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Heart aria-hidden
              className={`w-5 h-5 transition-colors ${
                isLiked ? 'fill-red-500 text-red-500' : 'text-gray-600'
              }`}
            />
          </button>
          </Tooltip>

          {/* Photo Count Badge - Bottom Center */}
          {photoCount > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5">
              <Camera aria-hidden className="w-3 h-3" />
              {photoCount} photo{photoCount === 1 ? '' : 's'}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-charcoal truncate">
                {model.display_name}, {model.age}
              </h3>
              <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
                <MapPin aria-hidden className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{model.city}, {model.state}</span>
              </div>
            </div>

            {/* Rating */}
            <div className="flex items-center gap-1 bg-secondary-muted px-2.5 py-1 rounded-full ml-2 flex-shrink-0">
              <Star aria-hidden className="w-3.5 h-3.5 fill-secondary text-secondary" />
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
            <div className="flex items-center gap-2">
              {voiceBtn}
              {videoBtn}
              {connectBtn}
            </div>
            <button
              className="text-sm font-medium text-primary hover:text-primary-dark transition-colors flex min-h-[44px] items-center gap-1"
              onClick={(e) => {
                e.preventDefault()
                // Navigate to profile
              }}
            >
              View Profile
              <span className="text-xs">→</span>
            </button>
          </div>
          {note && <p className="mt-2 text-xs text-neutral-500">{note}</p>}
        </div>
      </Card>
      {connectModal}
    </Link>
  )
}
