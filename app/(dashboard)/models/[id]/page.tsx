'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { BadgeCheck, CalendarCheck, MapPin, Phone, Star, Video, UserPlus, CheckCircle2 } from 'lucide-react'
import { formatPrice, getInitials } from '@/lib/utils/helpers'
import { RateCard } from '@/components/rates/RateCard'
import { ServiceChips } from '@/components/services/ServiceChips'
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
    rate_short_time_ngn: number | null
    rate_overnight_ngn: number | null
    rate_weekend_ngn: number | null
    services: string[] | null
  }
}

const JUMP_LINKS = [
  { href: '#photos', label: 'Photos' },
  { href: '#rates-services', label: 'Rates & services' },
  { href: '#availability', label: 'Availability' },
  { href: '#reviews', label: 'Reviews' },
]

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
            phone,
            rate_short_time_ngn,
            rate_overnight_ngn,
            rate_weekend_ngn,
            services
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
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <div className="h-72 animate-pulse rounded-3xl bg-neutral-100" />
        <div className="h-6 w-1/2 animate-pulse rounded-full bg-neutral-100" />
        <div className="h-4 w-2/3 animate-pulse rounded-full bg-neutral-100" />
        <div className="h-24 animate-pulse rounded-3xl bg-neutral-100" />
      </div>
    )
  }

  if (!model) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-charcoal">Profile not found</h1>
        <p className="mt-2 text-sm text-neutral-500">
          This companion may have removed her listing.
        </p>
      </div>
    )
  }

  const avatarUrl = model.profiles?.avatar_url

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      {/* Sticky jump-to nav, borrowed from the category leaders. */}
      <nav
        aria-label="Profile sections"
        className="sticky top-0 z-20 -mx-4 border-b border-black/[0.06] bg-cream/90 px-4 py-2.5 backdrop-blur-md"
      >
        <div className="flex items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {JUMP_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-black/[0.04] hover:text-charcoal"
            >
              {l.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Photos */}
      <section id="photos" className="scroll-mt-16 pt-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-charcoal shadow-[0_8px_40px_rgba(26,26,26,0.18)]">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={model.display_name}
              className="h-80 w-full object-cover sm:h-96"
            />
          ) : (
            <div className="flex h-80 items-center justify-center text-6xl font-bold text-[#AC244D]">
              {getInitials(model.display_name)}
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h1 className="flex items-center gap-2 font-display text-3xl font-semibold tracking-tight text-white">
                  {model.display_name}, {model.age}
                  <BadgeCheck className="h-6 w-6 fill-[#AC244D] text-white" />
                </h1>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/80">
                  <MapPin className="h-4 w-4" />
                  {model.city}, {model.state}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-md">
                <Star className="h-4 w-4 fill-[#C9A84C] text-[#C9A84C]" />
                <span className="text-sm font-semibold text-white">
                  {model.rating_avg ? model.rating_avg.toFixed(1) : 'New'}
                </span>
                <span className="text-xs text-white/70">({model.review_count})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Structured facts */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-600 ring-1 ring-black/[0.06]">
            {model.age} years old
          </span>
          <span className="rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-600 ring-1 ring-black/[0.06]">
            {model.city}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#AC244D]/10 px-3.5 py-1.5 text-xs font-semibold text-[#8F1D40]">
            <BadgeCheck className="h-3.5 w-3.5" />
            ID verified
          </span>
          {model.is_available && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3.5 py-1.5 text-xs font-semibold text-green-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              Available now
            </span>
          )}
        </div>

        {model.bio && (
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-neutral-600">{model.bio}</p>
        )}
      </section>

      {/* Rates & services */}
      <section id="rates-services" className="scroll-mt-16 pt-10">
        <h2 className="font-display text-[22px] font-semibold tracking-tight text-charcoal">
          Rates & services
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Listed upfront. Nothing is paid until you request a connection.
        </p>
        <div className="mt-4">
          <RateCard
            rates={{
              shortTime: model.profiles?.rate_short_time_ngn ?? null,
              overnight: model.profiles?.rate_overnight_ngn ?? null,
              weekend: model.profiles?.rate_weekend_ngn ?? null,
            }}
          />
        </div>
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
            What she offers
          </p>
          <ServiceChips
            services={model.profiles?.services}
            emptyLabel="Services not listed yet"
          />
        </div>
      </section>

      {/* Availability */}
      <section id="availability" className="scroll-mt-16 pt-10">
        <h2 className="font-display text-[22px] font-semibold tracking-tight text-charcoal">
          Availability
        </h2>
        <div className="mt-4 flex items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-black/[0.04]">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              model.is_available ? 'bg-green-50' : 'bg-neutral-100'
            }`}
          >
            <CalendarCheck
              className={`h-5 w-5 ${model.is_available ? 'text-green-600' : 'text-neutral-400'}`}
            />
          </span>
          <div>
            <p className="text-sm font-semibold text-charcoal">
              {model.is_available ? 'Available now' : 'Currently unavailable'}
            </p>
            <p className="text-xs text-neutral-500">
              {model.is_available
                ? 'Request a connection and she will confirm shortly.'
                : 'Check back later or browse other companions.'}
            </p>
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section id="reviews" className="scroll-mt-16 pt-10">
        <h2 className="font-display text-[22px] font-semibold tracking-tight text-charcoal">
          Reviews
        </h2>
        <div className="mt-4 rounded-3xl bg-white p-8 text-center ring-1 ring-black/[0.04]">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#C9A84C]/15">
            <Star className="h-6 w-6 text-[#C9A84C]" />
          </div>
          <p className="text-sm font-semibold text-charcoal">No reviews yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-neutral-500">
            Reviews appear here after completed bookings, from verified clients only.
          </p>
        </div>
      </section>

      {/* CTAs */}
      <div className="mt-10 flex flex-col gap-2.5">
        {connected ? (
          <Button disabled className="w-full border-green-300 py-3.5 text-green-700" variant="outline">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Connected
          </Button>
        ) : (
          <Button
            className="w-full bg-[#AC244D] py-3.5 text-base font-semibold text-white transition-all hover:bg-[#8F1D40] active:scale-[0.99]"
            disabled={!canCall}
            title={canCall ? 'Request a connection' : callsDisabledCopy}
            onClick={() => setShowConnectModal(true)}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Request connection
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Button
            variant="outline"
            className="py-3 transition-all active:scale-[0.99]"
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
            className="py-3 transition-all active:scale-[0.99]"
            disabled={!canCall}
            title={canCall ? 'Start a video call' : callsDisabledCopy}
            onClick={() => {
              if (model.profile_id) void startCall(model.profile_id, model.display_name, 'video')
            }}
          >
            <Video className="mr-2 h-4 w-4" />
            Video call
          </Button>
        </div>
        <p className="mt-1 text-center text-xs text-neutral-400">
          Area location only, never an exact address
        </p>
      </div>

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
