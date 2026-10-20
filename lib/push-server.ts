// Server-only Web Push helpers for Intima.
// VAPID keys come from env: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
// Never import this module from client components.
import webpush from 'web-push'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendWhatsAppText } from './notify/whatsapp'

let configured = false

function ensureConfigured(): void {
  if (configured) return
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) throw new Error('VAPID keys not set')
  webpush.setVapidDetails('mailto:hello@intima.example', pub, priv)
  configured = true
}

function serviceDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export interface PushPayload {
  title: string
  body?: string
  url?: string
  tag?: string
}

// Send a push to every subscribed device of the given users.
// Best effort: expired/invalid subscriptions are pruned. Returns send count.
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<number> {
  ensureConfigured()
  if (userIds.length === 0) return 0
  const db = serviceDb()
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)
  if (!subs || subs.length === 0) return 0

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body || '',
    url: payload.url || '/',
    tag: payload.tag || 'intima',
  })

  let sent = 0
  await Promise.all(
    subs.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as never,
          body
        )
        sent++
      } catch (err: unknown) {
        // 404/410 = subscription gone, prune it so we stop trying.
        const status = (err as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) {
          await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }
    })
  )
  return sent
}

export interface NotifyOpts {
  userIds: string[]
  type: string
  title: string
  body?: string
  link?: string
}

// Reusable primitive for app events: write notification rows for the
// recipients, then fan out push. Push is best effort and never throws,
// so a notification failure can never break the UX that triggered it.
export async function notifyUsers(opts: NotifyOpts): Promise<void> {
  if (opts.userIds.length === 0) return
  const db = serviceDb()
  try {
    await db.from('notifications').insert(
      opts.userIds.map((user_id) => ({
        user_id,
        type: opts.type,
        title: opts.title,
        body: opts.body ?? null,
        link: opts.link ?? null,
      }))
    )
  } catch {
    // A failed insert must not break the triggering UX either.
    return
  }
  try {
    await sendPushToUsers(opts.userIds, {
      title: opts.title,
      body: opts.body,
      url: opts.link,
      tag: `intima-${opts.type}`,
    })
  } catch {
    // Push is best effort; the in-app notification is the source of truth.
  }
  // Best-effort WhatsApp pass for recipients who shared a phone
  // number. Dormant until WHATSAPP_TOKEN and WHATSAPP_PHONE_ID are
  // set (sendWhatsAppText returns not_configured and sends nothing),
  // and wrapped so it can never break the notification flow above.
  try {
    const { data: phoneRows } = await db
      .from('profiles')
      .select('id, phone')
      .in('id', opts.userIds)
    const text = opts.body
      ? `${opts.title}\n${opts.body}`
      : opts.title
    const fullText = opts.link ? `${text}\n${opts.link}` : text
    for (const row of phoneRows ?? []) {
      const phone = (row as { phone?: string | null }).phone
      if (phone) {
        await sendWhatsAppText(phone, fullText)
      }
    }
  } catch {
    // WhatsApp is best effort only.
  }
}

