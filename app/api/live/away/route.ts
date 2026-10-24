import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceDb } from '@/lib/supabase/service'
import { AWAY_GRACE_SECONDS } from '@/lib/live/hostAway'

/**
 * POST /api/live/away { sessionId, action }
 *
 * The host-away countdown's server half. The stamp lives on
 * live_sessions.away_since and this route is its only writer,
 * so the countdown every viewer sees runs on one clock.
 *
 * - start: a viewer noticed the host gone. Stamps away_since
 *   if empty and returns it. A stamp older than the grace on
 *   a still-live session is stale (the host came back without
 *   anyone clearing it, or nobody was watching when it should
 *   have ended), so it restarts rather than ending a stream
 *   whose host may be present.
 * - clear: the host is back (their studio reconnected, or a
 *   viewer saw them return). Wipes the stamp.
 * - state: read the stamp and status, for late joiners and
 *   for the periodic resync that keeps every screen honest.
 * - end: the countdown ran out. Ends the session (the same
 *   update the host's End button makes) only when the stamp
 *   really is at least the grace old on the server's clock,
 *   so no client can end a stream early.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    }

    const { sessionId, action } = await req.json()
    if (!sessionId || !['start', 'clear', 'state', 'end'].includes(action)) {
      return NextResponse.json({ error: 'sessionId and a valid action are required' }, { status: 400 })
    }

    const svc = serviceDb()
    const { data: session } = await svc
      .from('live_sessions')
      .select('id, status, away_since')
      .eq('id', sessionId)
      .maybeSingle()
    if (!session) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 })
    }
    if (session.status !== 'live') {
      return NextResponse.json({ status: session.status, awaySince: null, ended: true })
    }

    const now = Date.now()
    let awaySince = (session as { away_since: string | null }).away_since

    if (action === 'clear') {
      if (awaySince) {
        await svc.from('live_sessions').update({ away_since: null }).eq('id', sessionId)
      }
      return NextResponse.json({ ok: true, awaySince: null })
    }

    if (action === 'start') {
      const stale =
        awaySince !== null &&
        now - new Date(awaySince).getTime() > AWAY_GRACE_SECONDS * 1000
      if (!awaySince || stale) {
        const stamp = new Date(now).toISOString()
        await svc.from('live_sessions').update({ away_since: stamp }).eq('id', sessionId)
        awaySince = stamp
      }
      return NextResponse.json({ awaySince })
    }

    if (action === 'state') {
      return NextResponse.json({ status: session.status, awaySince })
    }

    // action === 'end': the server's clock is the referee.
    if (
      awaySince &&
      now - new Date(awaySince).getTime() >= (AWAY_GRACE_SECONDS - 2) * 1000
    ) {
      await svc
        .from('live_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString(), away_since: null })
        .eq('id', sessionId)
      return NextResponse.json({ ended: true })
    }
    return NextResponse.json({ ended: false, awaySince })
  } catch (e) {
    console.error('[live/away]', e)
    return NextResponse.json({ error: 'Away update failed' }, { status: 500 })
  }
}
