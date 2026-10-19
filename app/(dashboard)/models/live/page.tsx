'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Video, AlertCircle, Lock, Unlock } from 'lucide-react'

export default function GoLivePage() {
  const [title, setTitle] = useState('')
  const [paid, setPaid] = useState(false)
  const [price, setPrice] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleGoLive = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const { data: profile } = await supabase
        .from('profiles').select('role, display_name').eq('id', user.id).maybeSingle()
      if (profile?.role !== 'model') throw new Error('Only companions can go live')
      const priceNgn = paid ? Math.max(0, parseInt(price || '0', 10)) : 0
      if (paid && priceNgn <= 0) throw new Error('Set a join price, or choose free')
      await supabase.from('live_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('provider_id', user.id).eq('status', 'live')
      const { data: session, error: sessionError } = await supabase
        .from('live_sessions')
        .insert({
          provider_id: user.id,
          title: title.trim() || 'Live now',
          is_public: true,
          price_ngn: priceNgn,
          status: 'live',
        })
        .select('id').single()
      if (sessionError) throw sessionError
      try {
        const { data: clients } = await supabase.from('connections')
          .select('client_id').eq('provider_id', user.id).eq('status', 'active')
        const ids = [...new Set((clients ?? []).map((c: any) => c.client_id))]
        if (ids.length > 0) {
          await supabase.from('notifications').insert(
            ids.map((cid) => ({
              user_id: cid,
              type: 'live_started',
              title: (profile?.display_name ?? 'A companion') + ' is live',
              body: priceNgn > 0 ? 'Join for N' + priceNgn.toLocaleString() : 'Join free now',
              link: '/live/' + session.id,
            }))
          )
        }
      } catch { /* notifications best-effort */ }
      router.push('/live/' + session.id + '?host=1')
    } catch (err: any) {
      setError(err.message || 'Failed to start stream')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-sm">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-charcoal">
          <Video className="h-6 w-6 text-primary" /> Go Live
        </h1>
        <p className="mt-1 text-sm text-neutral-500">Stream to your audience TikTok-style. You decide free or paid.</p>
        <form onSubmit={handleGoLive} className="mt-6 space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-charcoal">Stream title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Evening chat"
              maxLength={80} className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-charcoal">Access</label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setPaid(false)}
                className={'flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ' + (!paid ? 'border-primary bg-primary/5 text-primary' : 'border-neutral-200 text-neutral-500')}>
                <Unlock className="h-4 w-4" /> Free to join
              </button>
              <button type="button" onClick={() => setPaid(true)}
                className={'flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ' + (paid ? 'border-gold bg-gold/10 text-charcoal' : 'border-neutral-200 text-neutral-500')}>
                <Lock className="h-4 w-4" /> Pay to join
              </button>
            </div>
          </div>
          {paid && (
            <div>
              <label className="mb-1 block text-sm font-medium text-charcoal">Join price (N)</label>
              <input type="number" min={100} step={100} value={price} onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 2000" className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-primary" />
              <p className="mt-1 text-xs text-neutral-400">Viewers pay once to join. You keep 100%.</p>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <button type="submit" disabled={loading}
            className="w-full rounded-full bg-primary py-3 text-sm font-bold text-white disabled:opacity-50">
            {loading ? 'Starting...' : 'Go live now'}
          </button>
        </form>
      </div>
    </div>
  )
}
