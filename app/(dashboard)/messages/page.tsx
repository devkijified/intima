'use client'

import { PullToRefresh } from '@/components/shared/PullToRefresh'
import { IntimaLoader } from '@/components/shared/IntimaLoader'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { MessageCircle } from '@/lib/icons'
import Ticks, { tickStateFor } from '@/components/chat/Ticks'
import { formatCompactCount } from '@/lib/utils/helpers'

interface ThreadRow {
  connectionId: string
  counterpartId: string
  name: string
  avatar: string | null
  lastBody: string | null
  lastAt: string | null
  unread: number
  lastMine: boolean
  lastDeleted: boolean
  lastTick: 'sent' | 'delivered' | 'read' | null
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export default function MessagesPage() {
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [loading, setLoading] = useState(true)

  const loadThreads = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: conns } = await supabase
      .from('connections')
      .select('id, client_id, provider_id, created_at')
      .or(`client_id.eq.${user.id},provider_id.eq.${user.id}`)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    const rows: ThreadRow[] = []
    for (const c of conns ?? []) {
      const otherId = c.client_id === user.id ? c.provider_id : c.client_id
      const { data: prof } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', otherId)
        .single()
      const { data: last } = await supabase
        .from('messages')
        .select('body, created_at, sender_id, read_at, delivered_at, deleted_at')
        .eq('connection_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const { count: unreadCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('connection_id', c.id)
        .neq('sender_id', user.id)
        .is('read_at', null)
      rows.push({
        connectionId: c.id,
        counterpartId: otherId,
        name: prof?.display_name ?? 'Member',
        avatar: prof?.avatar_url ?? null,
        lastBody: last?.deleted_at ? 'This message was deleted' : (last?.body ?? null),
        lastAt: last?.created_at ?? c.created_at,
        unread: unreadCount ?? 0,
        lastMine: !!last && last.sender_id === user.id,
        lastDeleted: !!last?.deleted_at,
        lastTick: last && last.sender_id === user.id && !last.deleted_at ? tickStateFor(last) : null,
      })
    }
    setThreads(rows); setLoading(false)
    // Opening the messages list means their messages have reached
    // this device: stamp delivered_at (not read; reading happens
    // inside the thread) so the sender's ticks can show delivered.
    const connIds = (conns ?? []).map((c) => c.id)
    if (connIds.length > 0) {
      supabase
        .from('messages')
        .update({ delivered_at: new Date().toISOString() })
        .in('connection_id', connIds)
        .neq('sender_id', user.id)
        .is('delivered_at', null)
        .then(() => {})
    }
  }

  useEffect(() => {
    loadThreads()
    // Coming back from a thread (or back to the tab) must show
    // true counts at once: the router can restore this page
    // without a remount, which used to leave stale badges up.
    const refresh = () => { void loadThreads() }
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <PullToRefresh onRefresh={loadThreads} className="mx-auto max-w-2xl px-4 py-6 pb-28 md:pb-10">
      <h1 className="font-display text-2xl font-semibold text-charcoal">Messages</h1>
      <p className="mt-1 text-sm text-neutral-500">Chats open when a connection is active.</p>

      {loading ? (
        <div data-page-loader className="flex items-center justify-center py-16">
          <IntimaLoader size="lg" />
        </div>
      ) : threads.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-neutral-200 bg-white p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cream">
            <MessageCircle className="h-7 w-7 text-neutral-400" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-charcoal">No conversations yet</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Request a connection with a companion and your chat will appear here.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white"
          >
            Browse companions
          </Link>
        </div>
      ) : (
        <div className="mt-3 divide-y divide-neutral-100">
          {threads.map((t) => (
            <Link
              key={t.connectionId}
              href={`/messages/${t.connectionId}`}
              className="flex items-center gap-3 px-1 py-3.5 transition-colors active:bg-cream/60"
            >
              {t.avatar ? (
                <img src={t.avatar} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cream font-display text-lg text-neutral-400">
                  {(t.name[0] ?? '?').toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[15px] font-semibold text-charcoal">{t.name}</p>
                  <span className={`shrink-0 text-xs ${t.unread > 0 ? 'font-semibold text-primary' : 'text-neutral-400'}`}>
                    {timeAgo(t.lastAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className={`flex min-w-0 items-center truncate text-sm ${t.unread > 0 ? 'font-semibold text-charcoal' : 'text-neutral-500'} ${t.lastDeleted ? 'italic' : ''}`}>
                    {t.lastMine && t.lastTick && <Ticks state={t.lastTick} className="mr-1" />}
                    <span className="truncate">{t.lastBody ?? 'Connection active. Say hello'}</span>
                  </p>
                  {t.unread > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
                      {formatCompactCount(t.unread)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PullToRefresh>
  )
}
