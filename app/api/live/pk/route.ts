import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { notifyUsers } from '@/lib/push-server';

/**
 * PK battles: two live sessions compete on gift coins inside a window.
 *
 * POST /api/live/pk
 *   Host of session A starts a battle against session B.
 *   Body: { sessionId, opponentSessionId, durationMinutes? } (default 10).
 *
 * GET /api/live/pk?sessionId=<id>
 *   Returns the battle involving that session with live scores. Score is
 *   the sum of gift_transactions.coin_cost per session inside the battle
 *   window. Finalization is lazy and lives in this GET handler: when a
 *   read finds the window has ended on an active battle, it computes the
 *   winner, marks the battle finished, and notifies both hosts. No cron.
 */

interface BattleRow {
  id: string;
  session_a: string;
  session_b: string;
  starts_at: string;
  ends_at: string;
  winner_session_id: string | null;
  status: string;
  created_by: string | null;
}

function serviceClient(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function scoreFor(
  service: SupabaseClient,
  sessionId: string,
  from: string,
  to: string
): Promise<number> {
  const { data } = await service
    .from('gift_transactions')
    .select('coin_cost')
    .eq('session_id', sessionId)
    .gte('created_at', from)
    .lte('created_at', to);
  return (data ?? []).reduce(
    (sum: number, r: { coin_cost: number }) => sum + (r.coin_cost ?? 0),
    0
  );
}

async function finalizeBattle(
  service: SupabaseClient,
  battle: BattleRow
): Promise<BattleRow> {
  const [a, b] = await Promise.all([
    scoreFor(service, battle.session_a, battle.starts_at, battle.ends_at),
    scoreFor(service, battle.session_b, battle.starts_at, battle.ends_at),
  ]);
  const winner = a === b ? null : a > b ? battle.session_a : battle.session_b;
  const { data: updated } = await service
    .from('pk_battles')
    .update({ status: 'finished', winner_session_id: winner })
    .eq('id', battle.id)
    .eq('status', 'active')
    .select('id, session_a, session_b, starts_at, ends_at, winner_session_id, status, created_by')
    .maybeSingle();
  const done = (updated as BattleRow | null) ?? { ...battle, status: 'finished', winner_session_id: winner };

  // Notify both hosts. Type 'system' because the notifications type
  // check does not have a PK value yet.
  const { data: sessions } = await service
    .from('live_sessions')
    .select('id, provider_id')
    .in('id', [battle.session_a, battle.session_b]);
  const hostIds = [...new Set((sessions ?? []).map((s: { provider_id: string }) => s.provider_id))];
  if (hostIds.length > 0) {
    const result = winner === null ? 'The PK battle ended in a tie.' : 'The PK battle has a winner. Open the stream to see the result.';
    await notifyUsers({
      userIds: hostIds,
      type: 'system',
      title: 'PK battle finished',
      body: result,
      link: `/live/${battle.session_a}`,
    });
  }
  return done;
}

async function battlePayload(
  service: SupabaseClient,
  battle: BattleRow,
  forSessionId: string
) {
  const nowIso = new Date().toISOString();
  const scoreTo = battle.status === 'active' && nowIso < battle.ends_at ? nowIso : battle.ends_at;
  const [scoreA, scoreB] = await Promise.all([
    scoreFor(service, battle.session_a, battle.starts_at, scoreTo),
    scoreFor(service, battle.session_b, battle.starts_at, scoreTo),
  ]);
  const opponentId = battle.session_a === forSessionId ? battle.session_b : battle.session_a;
  const { data: oppSession } = await service
    .from('live_sessions')
    .select('id, provider_id, title')
    .eq('id', opponentId)
    .maybeSingle();
  let opponentName: string | null = null;
  if (oppSession?.provider_id) {
    const { data: prof } = await service
      .from('profiles')
      .select('display_name')
      .eq('id', oppSession.provider_id)
      .maybeSingle();
    opponentName = prof?.display_name ?? null;
  }
  return {
    id: battle.id,
    sessionA: battle.session_a,
    sessionB: battle.session_b,
    startsAt: battle.starts_at,
    endsAt: battle.ends_at,
    status: battle.status,
    winnerSessionId: battle.winner_session_id,
    scores: { a: scoreA, b: scoreB },
    mineIsA: battle.session_a === forSessionId,
    opponent: oppSession
      ? { sessionId: oppSession.id, hostId: oppSession.provider_id, hostName: opponentName, title: oppSession.title }
      : null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { sessionId, opponentSessionId, durationMinutes } = await req.json();
    if (!sessionId || !opponentSessionId || sessionId === opponentSessionId) {
      return NextResponse.json(
        { error: 'sessionId and a different opponentSessionId required' },
        { status: 400 }
      );
    }
    const minutes = Math.min(60, Math.max(1, Number(durationMinutes ?? 10) || 10));

    const service = serviceClient();
    const { data: sessions } = await service
      .from('live_sessions')
      .select('id, provider_id, status')
      .in('id', [sessionId, opponentSessionId]);
    const mine = (sessions ?? []).find((s: { id: string }) => s.id === sessionId);
    const opp = (sessions ?? []).find((s: { id: string }) => s.id === opponentSessionId);
    if (!mine || !opp) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }
    if (mine.provider_id !== user.id) {
      return NextResponse.json({ error: 'Only the host can start a PK battle' }, { status: 403 });
    }
    if (mine.status !== 'live' || opp.status !== 'live') {
      return NextResponse.json({ error: 'Both streams must be live' }, { status: 400 });
    }

    // One active battle per session at a time.
    const nowIso = new Date().toISOString();
    const { data: clash } = await service
      .from('pk_battles')
      .select('id')
      .eq('status', 'active')
      .gt('ends_at', nowIso)
      .or(
        `session_a.eq.${sessionId},session_b.eq.${sessionId},session_a.eq.${opponentSessionId},session_b.eq.${opponentSessionId}`
      )
      .limit(1);
    if (clash && clash.length > 0) {
      return NextResponse.json(
        { error: 'One of these streams is already in a PK battle' },
        { status: 409 }
      );
    }

    const starts = new Date();
    const ends = new Date(starts.getTime() + minutes * 60_000);
    const { data: battle, error } = await service
      .from('pk_battles')
      .insert({
        session_a: sessionId,
        session_b: opponentSessionId,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        created_by: user.id,
      })
      .select('id, session_a, session_b, starts_at, ends_at, winner_session_id, status, created_by')
      .single();
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      battle: await battlePayload(service, battle as BattleRow, sessionId),
    });
  } catch (e) {
    console.error('[live/pk POST]', e);
    return NextResponse.json({ error: 'Could not start PK battle' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const sessionId = req.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const service = serviceClient();
    const { data: rows } = await service
      .from('pk_battles')
      .select('id, session_a, session_b, starts_at, ends_at, winner_session_id, status, created_by')
      .or(`session_a.eq.${sessionId},session_b.eq.${sessionId}`)
      .order('created_at', { ascending: false })
      .limit(1);
    let battle = (rows?.[0] as BattleRow | undefined) ?? null;
    if (!battle) {
      return NextResponse.json({ battle: null });
    }

    // Lazy finalization: the window ended but nobody closed it yet.
    if (battle.status === 'active' && new Date(battle.ends_at).getTime() <= Date.now()) {
      battle = await finalizeBattle(service, battle);
    }

    // A finished battle only stays visible briefly, for the winner banner.
    if (battle.status === 'finished') {
      const sinceEnd = Date.now() - new Date(battle.ends_at).getTime();
      if (sinceEnd > 20_000) {
        return NextResponse.json({ battle: null });
      }
    }

    return NextResponse.json({
      battle: await battlePayload(service, battle, sessionId),
    });
  } catch (e) {
    console.error('[live/pk GET]', e);
    return NextResponse.json({ error: 'Could not load PK battle' }, { status: 500 });
  }
}
