'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Calendar, MessageCircle, Phone, Video, ArrowUpRight, Loader2, Wallet } from '@/lib/icons'

type ConnectionStatus = 'pending_payment' | 'active' | 'refunded' | 'expired'

interface Counterpart {
  id: string
  display_name: string | null
  avatar_url: string | null
  city: string | null
}

interface ConnectionRow {
  id: string
  fee_ngn: number
  status: ConnectionStatus
  proposed_rate_ngn: number | null
  created_at: string
  counterpart: Counterpart
}

const STATUS_STYLE: Record<ConnectionStatus, string> = {
  pending_payment: 'bg-amber-50 text-amber-700 border-amber-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  refunded: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  expired: 'bg-neutral-100 text-neutral-600 border-neutral-200',
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  pending_payment: 'Payment pending',
  active: 'Active',
  refunded: 'Refunded',
  expired: 'Expired',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function BookingsPage() {
  const [connections, setConnections] = useState<ConnectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isModel, setIsModel] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function fetchConnections() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      const model = (profile?.role ?? user.user_metadata?.role ?? 'client') === 'model'
      setIsModel(model)

      // Connections where I am the client (client view) or the provider (provider inbox).
      const { data: conns } = await supabase
        .from('connections')
        .select('id, fee_ngn, status, proposed_rate_ngn, created_at, client_id, provider_id')
        .eq(model ? 'provider_id' : 'client_id', user.id)
        .order('created_at', { ascending: false })

      if (!conns || conns.length === 0) {
        setConnections([])
        setLoading(false)
        return
      }

      // Counterpart profiles (provider for clients, client for providers).
      const counterpartIds = [...new Set(conns.map((c) => (model ? c.client_id : c.provider_id)))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', counterpartIds)

      // Cities for the provider side.
      const providerIds = [...new Set(conns.map((c) => c.provider_id))]
      const { data: presence } = await supabase
        .from('provider_presence')
        .select('provider_id, city')
        .in('provider_id', providerIds)

      const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
      const cityByProvider = new Map((presence ?? []).map((p) => [p.provider_id, p.city]))

      setConnections(
        conns.map((c) => {
          const counterpartId = model ? c.client_id : c.provider_id
          const p = profileById.get(counterpartId)
          return {
            id: c.id,
            fee_ngn: c.fee_ngn,
            status: c.status as ConnectionStatus,
            proposed_rate_ngn: c.proposed_rate_ngn,
            created_at: c.created_at,
            counterpart: {
              id: counterpartId,
              display_name: p?.display_name ?? null,
              avatar_url: p?.avatar_url ?? null,
              city: model ? null : (cityByProvider.get(c.provider_id) ?? null),
            },
          }
        })
      )
      setLoading(false)
    }

    fetchConnections()
  }, [supabase])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#AC244D] border-t-transparent"></div>
          <p className="mt-3 text-sm font-medium text-neutral-500 tracking-wide font-sans">Loading your bookings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 font-sans">
      {/* Header */}
      <div className="border-b border-neutral-200/80 pb-6">
        <span className="text-xs uppercase tracking-widest font-semibold text-[#AC244D]">
          {isModel ? 'Incoming requests' : 'My bookings'}
        </span>
        <h1 className="text-3xl font-serif font-normal text-neutral-900 tracking-tight mt-1">
          {isModel ? 'Connection Requests' : 'My Bookings'}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          {isModel
            ? 'Clients who paid the connection fee to reach you.'
            : 'Companions you have connected with.'}
        </p>
      </div>

      {connections.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-12 text-center shadow-xs">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#AC244D]/10">
            <Calendar className="h-7 w-7 text-[#AC244D]" />
          </div>
          <h2 className="font-serif text-xl text-neutral-900">
            {isModel ? 'No requests yet' : 'No bookings yet'}
          </h2>
          <p className="mt-2 text-sm text-neutral-500">
            {isModel
              ? 'When a client pays the connection fee, their request appears here.'
              : 'Browse companions and request a connection to get started.'}
          </p>
          {!isModel && (
            <Link
              href="/"
              className="mt-6 inline-flex items-center justify-center gap-1 rounded-full bg-[#AC244D] px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#8F1D40]"
            >
              Browse Companions
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {connections.map((c) => (
            <li
              key={c.id}
              className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs"
            >
              <div className="flex items-start gap-4">
                {/* Avatar */}
                {c.counterpart.avatar_url ? (
                  <img
                    src={c.counterpart.avatar_url}
                    alt={c.counterpart.display_name ?? 'Profile'}
                    className="h-14 w-14 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#AC244D]/10 font-serif text-xl text-[#AC244D]">
                    {(c.counterpart.display_name ?? '?')[0]?.toUpperCase()}
                  </div>
                )}

                {/* Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif text-lg text-neutral-900">
                      {c.counterpart.display_name ?? 'Member'}
                    </h3>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status]}`}
                    >
                      {STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  {c.counterpart.city && (
                    <p className="mt-0.5 text-sm text-neutral-500">{c.counterpart.city}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600">
                    <span className="inline-flex items-center gap-1">
                      <Wallet className="h-3.5 w-3.5 text-neutral-400" />
                      Fee paid: <strong className="text-neutral-900">₦{c.fee_ngn.toLocaleString()}</strong>
                    </span>
                    {c.proposed_rate_ngn != null && (
                      <span>
                        Offered: <strong className="text-neutral-900">₦{c.proposed_rate_ngn.toLocaleString()}</strong>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-neutral-400">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(c.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              {c.status === 'active' && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
                  <Link
                    href={`/messages/${c.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#AC244D] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#8F1D40]"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Open chat
                  </Link>

                </div>
              )}
              {c.status === 'pending_payment' && !isModel && (
                <div className="mt-4 border-t border-neutral-100 pt-4">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-amber-600"
                  >
                    <Wallet className="h-4 w-4" />
                    Complete payment
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
