'use client'

import { PullToRefresh } from '@/components/shared/PullToRefresh'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Send, Radio } from '@/lib/icons'
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck'
import { getSetting } from '@/lib/settings/platformSettings'

interface Update {
  id: string
  body: string
  created_at: string
  providerName: string
}

/**
 * Channel: companions post updates; followers read them here.
 *
 * PARKED IN DRAFT (user decision, 2026-10-21): the whole surface sits
 * behind the channel_enabled platform setting. While the flag is not
 * explicitly on, non-admins see a simple "not available yet" state and
 * no broadcasts are fetched at all; admins and super_admins can still
 * preview the real page. One settings flip restores everything.
 */
export default function ChannelPage() {
  const [gate, setGate] = useState<'checking' | 'draft' | 'open'>('checking')
  const [updates, setUpdates] = useState<Update[]>([])
  const [myBroadcasts, setMyBroadcasts] = useState<Update[]>([])
  const [isProvider, setIsProvider] = useState(false)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [postMsg, setPostMsg] = useState('')
  const [postErr, setPostErr] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    const { data: profile } = await supabase.from('profiles')
      .select('role').eq('id', user.id).maybeSingle()
    const provider = profile?.role === 'model' || profile?.role === 'admin' || profile?.role === 'super_admin'
    setIsProvider(provider)

    // Draft gate: admins and super_admins always preview the real
    // page. Everyone else needs channel_enabled explicitly on; while
    // it is off we stop here, before any broadcasts are fetched.
    const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
    if (!isAdmin) {
      const flag = await getSetting<boolean | string>('channel_enabled', false)
      if (flag !== true && flag !== 'true') {
        setGate('draft')
        setLoading(false)
        return
      }
    }
    setGate('open')

    const { data: follows } = await supabase.from('broadcast_follows')
      .select('provider_id').eq('follower_id', user.id)
    const ids = (follows ?? []).map((f: any) => f.provider_id)
    const mine = provider ? user.id : null
    const q = supabase.from('broadcasts')
      .select('id, body, created_at, provider_id, profiles!broadcasts_provider_id_fkey(display_name)')
      .order('created_at', { ascending: false })
      .limit(50)
    const { data: all } = ids.length > 0 || mine
      ? await q.in('provider_id', [...ids, ...(mine ? [mine] : [])])
      : await q.eq('provider_id', '00000000-0000-0000-0000-000000000000')
    const rows: Update[] = ((all ?? []) as any[]).map((b) => ({
      id: b.id,
      body: b.body,
      created_at: b.created_at,
      providerName: b.profiles?.display_name ?? 'Companion',
    }))
    setMyBroadcasts(rows.filter((r) => mine && (all as any[])?.find((x: any) => x.id === r.id)?.provider_id === mine))
    setUpdates(rows)
    setLoading(false)
  }

  async function post() {
    const body = draft.trim()
    if (!body || posting) return
    const scan = scanForLeaks(body)
    if (!scan.clean) {
      setPostErr(true)
      setPostMsg(leakWarning(scan.leaks))
      return
    }
    setPosting(true)
    setPostMsg('')
    const res = await fetch('/api/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    const d = await res.json().catch(() => ({}))
    setPosting(false)
    if (res.ok) {
      setDraft('')
      setPostErr(false)
      setPostMsg('Posted to your channel.')
      load()
    } else {
      setPostErr(true)
      setPostMsg(d.error ?? 'Could not post. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (gate === 'draft') {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-28 md:pb-10">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-charcoal">
          <Radio aria-hidden className="h-6 w-6 text-primary" /> Channel
        </h1>
        <div className="mt-6 rounded-3xl border border-neutral-200/80 bg-white p-10 text-center">
          <Radio className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-2 font-medium text-charcoal">Channel is not available yet</p>
          <p className="mt-1 text-sm text-neutral-500">This part of Intima is still being prepared. Updates from companions will live here when it opens.</p>
        </div>
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={load} className="mx-auto max-w-2xl px-4 pb-28 md:pb-10">
      <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-charcoal">
        <Radio aria-hidden className="h-6 w-6 text-primary" /> Channel
      </h1>
      <p className="mt-1 text-sm text-neutral-500">Updates from companions you follow. No noise, just drops.</p>

      {isProvider && (
        <div className="mt-5 rounded-3xl border border-neutral-200/80 bg-white p-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Tell your followers something… going live, new city, new photos"
            className="w-full rounded-2xl bg-cream/60 p-3 text-base md:text-sm text-charcoal outline-none placeholder:text-neutral-400"
          />
          <button
            onClick={post}
            disabled={!draft.trim() || posting}
            className="btn-luxe mt-2 inline-flex min-h-[44px] items-center justify-center px-4 py-2 text-sm"
          >
            <Send aria-hidden className="h-3.5 w-3.5" /> {posting ? 'Posting…' : 'Post update'}
          </button>
          {postMsg && (
            <p className={'mt-2 text-xs ' + (postErr ? 'font-medium text-red-600' : 'text-emerald-600')}>
              {postMsg}
            </p>
          )}
          <p className="mt-2 text-[11px] text-neutral-400">
            Keep it on Intima: contact details in posts are blocked, clients connect through the platform.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {updates.length === 0 ? (
          <div className="rounded-3xl border border-neutral-200/80 bg-white p-10 text-center">
            <Radio className="mx-auto h-8 w-8 text-neutral-300" />
            <p className="mt-2 font-medium text-charcoal">No updates yet</p>
            <p className="mt-1 text-sm text-neutral-500">Follow a companion from her profile and her updates land here.</p>
            <Link href="/" className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white">Browse companions</Link>
          </div>
        ) : updates.map((u) => (
          <article key={u.id} className="rounded-3xl border border-neutral-200/80 bg-white p-4">
            <p className="text-xs font-semibold text-primary">{u.providerName}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-charcoal">{u.body}</p>
            <p className="mt-2 text-[11px] text-neutral-400">{new Date(u.created_at).toLocaleString()}</p>
          </article>
        ))}
      </div>
      {myBroadcasts.length > 0 && <p className="mt-4 text-center text-xs text-neutral-400">Your own posts are marked in the feed above.</p>}
    </PullToRefresh>
  )
}
