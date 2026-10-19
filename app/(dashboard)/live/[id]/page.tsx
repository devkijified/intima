'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, Heart, Lock, Radio, X } from 'lucide-react'
import { formatCompactCount } from '@/lib/utils/helpers'

interface Stream {
  id: string
  provider_id: string
  title: string
  price_ngn: number
  viewer_count: number
  status: string
  provider: { display_name: string; avatar_url: string | null } | null
}

export default function StreamRoomPage() {
  const params = useParams()
  const search = useSearchParams()
  const router = useRouter()
  const isHost = search.get('host') === '1'
  const [stream, setStream] = useState<Stream | null>(null)
  const [loading, setLoading] = useState(true)
  const [joined, setJoined] = useState(isHost)
  const [paying, setPaying] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const supabase = createClient()
  const id = params.id as string

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)
      const { data } = await supabase.from('live_sessions')
        .select('id, provider_id, title, price_ngn, viewer_count, status')
        .eq('id', id).maybeSingle()
      if (data) {
        const { data: prof } = await supabase.from('profiles')
          .select('display_name, avatar_url').eq('id', data.provider_id).maybeSingle()
        setStream({ ...data, provider: prof })
        // Bump viewer count (best-effort, not for host).
        if (!isHost && data.status === 'live') {
          await supabase.from('live_sessions')
            .update({ viewer_count: (data.viewer_count ?? 0) + 1 }).eq('id', id)
        }
      }
      setLoading(false)
    }
    load()
  }, [id])

  const handleJoinPaid = async () => {
    setPaying(true)
    // TODO: wire real payment rail. For now, mark as joined (test mode).
    setTimeout(() => { setJoined(true); setPaying(false) }, 800)
  }

  const handleEnd = async () => {
    await supabase.from('live_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', id)
    router.push('/live')
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!stream || stream.status !== 'live') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Radio className="mx-auto h-12 w-12 text-neutral-300" />
        <h1 className="mt-4 font-display text-2xl font-semibold text-charcoal">Stream ended</h1>
        <p className="mt-2 text-sm text-neutral-500">This live session has ended.</p>
        <Link href="/live" className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white">
          Back to live
        </Link>
      </div>
    )
  }

  const needsPay = !isHost && !joined && stream.price_ngn > 0

  return (
    <div className="mx-auto max-w-md">
      <div className="relative h-[calc(100vh-120px)] overflow-hidden bg-charcoal">
        {stream.provider?.avatar_url ? (
          <img src={stream.provider.avatar_url} alt="" className="h-full w-full object-cover opacity-60" draggable={false} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Radio className="h-16 w-16 text-neutral-600" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />

        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
          </span>
          <span className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white">
            <Eye className="h-3 w-3" /> {formatCompactCount(stream.viewer_count)}
          </span>
        </div>
        <Link href="/live" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
          <X className="h-4 w-4" />
        </Link>

        {/* Paid gate */}
        {needsPay && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6">
            <div className="w-full rounded-3xl bg-white p-6 text-center">
              <Lock className="mx-auto h-10 w-10 text-gold" />
              <h2 className="mt-3 font-display text-xl font-semibold text-charcoal">Paid stream</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {stream.provider?.display_name} set a join fee for this stream.
              </p>
              <p className="mt-3 text-3xl font-bold text-charcoal">N{stream.price_ngn.toLocaleString()}</p>
              <button onClick={handleJoinPaid} disabled={paying}
                className="mt-4 w-full rounded-full bg-gold py-3 text-sm font-bold text-charcoal disabled:opacity-50">
                {paying ? 'Processing...' : 'Pay to join'}
              </button>
              <p className="mt-2 text-xs text-neutral-400">Test mode: no real charge yet</p>
            </div>
          </div>
        )}

        {/* Host controls */}
        {isHost && (
          <div className="absolute bottom-24 inset-x-4">
            <div className="rounded-2xl bg-black/60 p-4 text-center backdrop-blur-sm">
              <p className="text-sm font-semibold text-white">You are live</p>
              <p className="text-xs text-white/70">{stream.price_ngn > 0 ? 'Paid stream' : 'Free stream'}</p>
              <button onClick={handleEnd}
                className="mt-3 w-full rounded-full bg-red-600 py-2.5 text-sm font-bold text-white">
                End stream
              </button>
            </div>
          </div>
        )}

        {/* Bottom info */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="flex items-center gap-3">
            {stream.provider?.avatar_url ? (
              <img src={stream.provider.avatar_url} alt="" className="h-11 w-11 rounded-full border-2 border-white object-cover" />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-600 font-bold text-white">
                {(stream.provider?.display_name ?? 'M')[0]}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{stream.provider?.display_name}</p>
              <p className="truncate text-sm text-white/80">{stream.title}</p>
            </div>
            {!needsPay && !isHost && (
              <button className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm active:scale-95">
                <Heart className="h-5 w-5" />
              </button>
            )}
          </div>
          {!isHost && !needsPay && (
            <p className="mt-3 text-center text-xs text-white/60">Live video via Mux coming soon</p>
          )}
        </div>
      </div>
    </div>
  )
}
