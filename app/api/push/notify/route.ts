// POST /api/push/notify — reusable primitive for app events.
// Body: { user_ids: string[], type, title, body?, link? }.
// Writes notification rows and fans out Web Push.
//
// v1 authorization: the caller must be a provider with an ACTIVE connection
// to every target (covers live_started, booking_*, new_review). System
// events stay server-side only.
import { createClient } from '@/lib/supabase/server'
import { notifyUsers } from '@/lib/push-server'
import { NextResponse } from 'next/server'

const ALLOWED_TYPES = new Set([
  'live_started',
  'booking_request',
  'booking_accepted',
  'booking_message',
  'new_review',
])

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const userIds: unknown = body?.user_ids
  const type: unknown = body?.type
  const title: unknown = body?.title

  if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 500) {
    return NextResponse.json({ error: 'user_ids must be a non-empty array (max 500)' }, { status: 400 })
  }
  if (typeof type !== 'string' || !ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: 'type not allowed' }, { status: 400 })
  }
  if (typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'title required' }, { status: 400 })
  }
  const ids = [...new Set(userIds.filter((u): u is string => typeof u === 'string' && u.length > 0))]
  if (ids.length === 0) {
    return NextResponse.json({ error: 'no valid user ids' }, { status: 400 })
  }

  // Caller must be a provider with an active connection to every target.
  const { data: conns } = await supabase
    .from('connections')
    .select('client_id')
    .eq('provider_id', user.id)
    .eq('status', 'active')
    .in('client_id', ids)
  const covered = new Set((conns ?? []).map((c: { client_id: string }) => c.client_id))
  const unauthorized = ids.filter((id) => !covered.has(id))
  if (unauthorized.length > 0) {
    return NextResponse.json({ error: 'No active connection to some recipients' }, { status: 403 })
  }

  // Best effort: notifyUsers never throws, and never breaks the caller.
  await notifyUsers({
    userIds: ids,
    type,
    title: title.trim(),
    body: typeof body?.body === 'string' ? body.body : undefined,
    link: typeof body?.link === 'string' ? body.link : undefined,
  })
  return NextResponse.json({ ok: true, notified: ids.length })
}
