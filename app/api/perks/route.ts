import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { contestPhase } from '@/lib/perks/rules';

export const dynamic = 'force-dynamic';

const BUCKET = 'contest-entries';

/**
 * Perks contests, public read surface.
 * GET /api/perks: all contests with phases and entry counts.
 * GET /api/perks?contest=<id>: one contest with approved entries,
 * vote counts, the caller's own entry and the caller's current vote.
 * Guests can read everything; voting and entering need a session,
 * which is the point of the share links.
 */

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const db = svc();
  const contestId = req.nextUrl.searchParams.get('contest');

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!contestId) {
    const { data: contests, error } = await db
      .from('contests')
      .select('id, title, theme, prize_coins, starts_at, ends_at, status, created_at')
      .order('starts_at', { ascending: false })
      .limit(30);
    if (error) {
      return NextResponse.json({ error: 'Could not load contests' }, { status: 500 });
    }
    const ids = (contests ?? []).map((c) => c.id);
    const counts = new Map<string, number>();
    if (ids.length) {
      const { data: entries } = await db
        .from('contest_entries')
        .select('contest_id')
        .in('contest_id', ids)
        .eq('status', 'approved');
      for (const e of entries ?? []) {
        counts.set(e.contest_id, (counts.get(e.contest_id) ?? 0) + 1);
      }
    }
    return NextResponse.json({
      contests: (contests ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        theme: c.theme,
        prizeCoins: c.prize_coins,
        startsAt: c.starts_at,
        endsAt: c.ends_at,
        phase: contestPhase(c),
        entryCount: counts.get(c.id) ?? 0,
      })),
    });
  }

  const { data: contest } = await db
    .from('contests')
    .select('id, title, theme, prize_coins, prize_split, starts_at, ends_at, status')
    .eq('id', contestId)
    .maybeSingle();
  if (!contest) {
    return NextResponse.json({ error: 'Contest not found' }, { status: 404 });
  }

  const { data: entries } = await db
    .from('contest_entries')
    .select('id, provider_id, image_path, caption, created_at')
    .eq('contest_id', contestId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true });

  const providerIds = [...new Set((entries ?? []).map((e) => e.provider_id))];
  const names = new Map<string, { name: string; username: string | null; avatar: string | null }>();
  if (providerIds.length) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .in('id', providerIds);
    for (const p of profiles ?? []) {
      names.set(p.id, { name: p.display_name, username: p.username, avatar: p.avatar_url });
    }
  }

  const votes = new Map<string, number>();
  if (entries?.length) {
    const { data: vrows } = await db
      .from('contest_votes')
      .select('entry_id')
      .eq('contest_id', contestId);
    for (const v of vrows ?? []) {
      votes.set(v.entry_id, (votes.get(v.entry_id) ?? 0) + 1);
    }
  }

  let myEntry: { id: string; status: string } | null = null;
  let myVoteEntryId: string | null = null;
  if (user) {
    const { data: mine } = await db
      .from('contest_entries')
      .select('id, status')
      .eq('contest_id', contestId)
      .eq('provider_id', user.id)
      .maybeSingle();
    if (mine) myEntry = { id: mine.id, status: mine.status };
    const { data: vote } = await db
      .from('contest_votes')
      .select('entry_id')
      .eq('contest_id', contestId)
      .eq('voter_id', user.id)
      .maybeSingle();
    if (vote) myVoteEntryId = vote.entry_id;
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return NextResponse.json({
    contest: {
      id: contest.id,
      title: contest.title,
      theme: contest.theme,
      prizeCoins: contest.prize_coins,
      prizeSplit: contest.prize_split,
      startsAt: contest.starts_at,
      endsAt: contest.ends_at,
      phase: contestPhase(contest),
    },
    entries: (entries ?? []).map((e) => ({
      id: e.id,
      providerId: e.provider_id,
      providerName: names.get(e.provider_id)?.name ?? 'Companion',
      providerUsername: names.get(e.provider_id)?.username ?? null,
      providerAvatar: names.get(e.provider_id)?.avatar ?? null,
      imageUrl: `${base}/storage/v1/object/public/${BUCKET}/${e.image_path}`,
      caption: e.caption,
      votes: votes.get(e.id) ?? 0,
      createdAt: e.created_at,
    })),
    myEntry,
    myVoteEntryId,
    signedIn: !!user,
    myId: user?.id ?? null,
  });
}
