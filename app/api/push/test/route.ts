// POST /api/push/test — send a test push to the caller's own devices.
// Lets a user verify push works end to end from the notifications page.
import { createClient } from '@/lib/supabase/server'
import { sendPushToUsers } from '@/lib/push-server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const sent = await sendPushToUsers([session.user.id], {
      title: 'Intima test',
      body: 'Push is working. You will get alerts here.',
      tag: 'intima-test',
    })
    return NextResponse.json({ ok: true, sent })
  } catch {
    // VAPID keys not set on the server.
    return NextResponse.json({ ok: true, sent: 0, pushSkipped: true })
  }
}
