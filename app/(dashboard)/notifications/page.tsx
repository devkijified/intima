'use client'

import { PullToRefresh } from '@/components/shared/PullToRefresh'
import { IntimaLoader } from '@/components/shared/IntimaLoader'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { pushState, subscribePush, unsubscribePush, PushState, iosNeedsInstall } from '@/lib/push-client'
import { Bell, Radio, Calendar, Star, MessageCircle, Info, CheckCheck, Smartphone, Phone } from '@/lib/icons'
import { PageHeader } from '@/app/(dashboard)/_components/PageHeader'
import { EmptyState } from '@/app/(dashboard)/_components/EmptyState'

interface Notif {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

const ICONS: Record<string, any> = {
  live_started: Radio,
  booking_request: Calendar,
  booking_accepted: Calendar,
  new_connection: Calendar,
  booking_message: MessageCircle,
  incoming_call: Phone,
  new_review: Star,
  system: Info,
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return Math.floor(s / 60) + 'm'
  if (s < 86400) return Math.floor(s / 3600) + 'h'
  return Math.floor(s / 86400) + 'd'
}

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)
  const [push, setPush] = useState<PushState>('available')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState<string | null>(null)
  const [iosInstallNeeded, setIosInstallNeeded] = useState(false)
  const supabase = createClient()

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    const { data } = await supabase.from('notifications')
      .select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
    setNotifs((data ?? []) as Notif[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  const markAllRead = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    setNotifs((ns) => ns.map((n) => ({ ...n, read: true })))
  }

  useEffect(() => {
    pushState().then(setPush).catch(() => {})
    setIosInstallNeeded(iosNeedsInstall())
  }, [])

  async function togglePush() {
    setPushBusy(true)
    setPushMsg(null)
    if (push === 'subscribed') {
      await unsubscribePush()
      setPush(await pushState())
      setPushMsg('Push turned off on this device.')
    } else {
      const res = await subscribePush()
      setPush(await pushState())
      if (res.ok) {
        setPushMsg('Push is on. Alerts will pop up here even with the app closed.')
      } else if (res.reason === 'no-key') {
        setPushMsg("Push notifications are not available right now.")
      } else if (res.reason === 'denied') {
        setPushMsg('Notifications are blocked. Allow them in your browser settings, then try again.')
      } else if (res.reason === 'unsupported') {
        setPushMsg('This browser does not support push notifications.')
      } else {
        setPushMsg('Could not turn on push. Check your connection and try again.')
      }
    }
    setPushBusy(false)
  }

  async function sendTestPush() {
    setPushBusy(true)
    setPushMsg(null)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (data?.ok && data?.sent > 0) {
        setPushMsg('Test sent. It should pop up on this device now.')
      } else if (data?.pushSkipped) {
        setPushMsg("Push notifications are not available right now.")
      } else if (data?.sent === 0) {
        setPushMsg('This device is not subscribed. Turn push on first.')
      } else {
        setPushMsg(data?.error || 'Test failed. Try again.')
      }
    } catch {
      setPushMsg('Test failed. Check your connection and try again.')
    }
    setPushBusy(false)
  }

  const openNotif = async (n: Notif) => {
    if (!n.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', n.id)
      setNotifs((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
    }
  }

  if (loading) {
    return (
      <div data-page-loader className="flex min-h-[40vh] items-center justify-center">
        <IntimaLoader size="lg" />
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={load} className="mx-auto max-w-2xl animate-rise-in">
      <PageHeader
        title="Notifications"
        action={
          notifs.some((n) => !n.read) ? (
            <button onClick={markAllRead} className="flex min-h-[44px] items-center gap-1.5 rounded-full px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary-muted">
              <CheckCheck aria-hidden className="h-4 w-4" /> Mark all read
            </button>
          ) : undefined
        }
      />

      <div className="card-luxe mt-6 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary">
            <Smartphone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-charcoal">Push notifications</p>
            <p className="mt-0.5 text-sm text-neutral-500">
              {iosInstallNeeded ? 'iPhone only supports push for web apps added to the Home Screen. Add Intima to your Home Screen, then turn push on here.'
                : push === 'unsupported' ? 'Not supported in this browser.'
                : push === 'denied' ? 'Blocked. Allow notifications in your browser settings to turn on.'
                : push === 'subscribed' ? 'On. Alerts will pop up here even with the app closed.'
                : 'Off. Turn on to get alerts on this device.'}
            </p>
          </div>
          {!iosInstallNeeded && push !== 'unsupported' && push !== 'denied' && (
            <button
              onClick={togglePush}
              disabled={pushBusy}
              className={'shrink-0 rounded-full px-4 py-2 min-h-[44px] text-xs font-semibold transition-all disabled:opacity-50 ' +
                (push === 'subscribed' ? 'border border-neutral-300 text-charcoal hover:bg-neutral-50 active:scale-[0.98]' : 'btn-luxe')}
            >
              {push === 'subscribed' ? 'Turn off' : 'Turn on'}
            </button>
          )}
        </div>
        {push === 'subscribed' && (
          <button onClick={sendTestPush} disabled={pushBusy} className="mt-3 inline-flex min-h-[44px] items-center text-xs font-semibold text-primary hover:underline disabled:opacity-50">
            Send me a test notification
          </button>
        )}
        {pushMsg && <p className="mt-2 text-xs text-neutral-500">{pushMsg}</p>}
      </div>

      {notifs.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            guidance="Live streams, bookings, and reviews will show up here."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {notifs.map((n) => {
            const Icon = ICONS[n.type] ?? Info
            const inner = (
              <div onClick={() => openNotif(n)}
                className={'flex items-start gap-3 rounded-3xl p-4 ring-1 transition-all duration-200 hover:shadow-lift ' + (!n.read ? 'bg-primary/[0.04] ring-primary/25 shadow-soft' : 'bg-white ring-black/[0.045] shadow-soft')}>
                <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' + (!n.read ? 'bg-primary-muted text-primary' : 'bg-neutral-100 text-neutral-500')}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-charcoal">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-sm text-neutral-500">{n.body}</p>}
                  <p className="mt-1 text-xs text-neutral-400">{timeAgo(n.created_at)} ago</p>
                </div>
                {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </div>
            )
            return n.link ? <Link key={n.id} href={n.link}>{inner}</Link> : <div key={n.id}>{inner}</div>
          })}
        </div>
      )}
    </PullToRefresh>
  )
}
