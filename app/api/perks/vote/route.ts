import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { contestPhase } from '@/lib/perks/rules';

/**
 * POST /api/perks/vote { contestId, entryId }
 * One vote per account per contest, movable until the contest
 * ends. Signed-in only (a vote has to belong to somebody, that is
 * the anti-fraud), and never for your own entry.
 */

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to vote' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const contestId = typeof body.contestId === 'string' ? body.contestId : '';
  const entryId = typeof body.entryId === 'string' ? body.entryId : '';
  if (!contestId || !entryId) {
    return NextResponse.json({ error: 'contestId and entryId required' }, { status: 400 });
  }

  const db = svc();
  const { data: contest } = await db
    .from('contests')
    .select('id, starts_at, ends_at, status')
    .eq('id', contestId)
    .maybeSingle();
  if (!contest) {
    return NextResponse.json({ error: 'Contest not found' }, { status: 404 });
  }
  if (contestPhase(contest) !== 'live') {
    return NextResponse.json({ error: 'Voting is not open for this contest right now' }, { status: 400 });
  }

  const { data: entry } = await db
    .from('contest_entries')
    .select('id, provider_id, status')
    .eq('id', entryId)
    .eq('contest_id', contestId)
    .maybeSingle();
  if (!entry || entry.status !== 'approved') {
    return NextResponse.json({ error: 'That entry cannot be voted on' }, { status: 400 });
  }
  if (entry.provider_id === user.id) {
    return NextResponse.json({ error: 'You cannot vote for your own entry' }, { status: 400 });
  }

  const { error } = await db
    .from('contest_votes')
    .upsert(
      { contest_id: contestId, entry_id: entryId, voter_id: user.id },
      { onConflict: 'contest_id,voter_id' },
    );
  if (error) {
    return NextResponse.json({ error: 'Could not save your vote' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, entryId });
}
