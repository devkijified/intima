import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { prizeForPlace } from '@/lib/perks/rules';
import { notifyUsers } from '@/lib/push-server';

export const dynamic = 'force-dynamic';

/**
 * Admin Perks: create contests, moderate entries, close and pay.
 *
 * GET: contests with per-status entry counts, plus the pending
 * entry queue across all contests (creator names attached).
 * POST actions:
 *   { action: 'create', title, theme, prizeCoins, prizeSplit,
 *     startsAt, endsAt }
 *   { action: 'entry', entryId, decision: 'approved'|'rejected'|'removed' }
 *   { action: 'close', contestId }: stops the contest.
 *   { action: 'pay', contestId }: ranks approved entries by votes
 *     (earliest entry wins a tie), credits winners through
 *     credit_coins with ref contest:<id>:<entryId> so a retried
 *     payout can never double-pay, then marks the contest paid.
 */

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  return profile && ['admin', 'super_admin'].includes(profile.role) ? user : null;
}

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const db = svc();

  const { data: contests } = await db
    .from('contests')
    .select('id, title, theme, prize_coins, prize_split, starts_at, ends_at, status, created_at')
    .order('created_at', { ascending: false })
    .limit(30);

  const { data: pending } = await db
    .from('contest_entries')
    .select('id, contest_id, provider_id, image_path, caption, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50);

  const providerIds = [...new Set((pending ?? []).map((e) => e.provider_id))];
  const names = new Map<string, { name: string; username: string | null }>();
  if (providerIds.length) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, display_name, username')
      .in('id', providerIds);
    for (const p of profiles ?? []) names.set(p.id, { name: p.display_name, username: p.username });
  }
  const titles = new Map((contests ?? []).map((c) => [c.id, c.title]));
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  return NextResponse.json({
    contests: contests ?? [],
    pendingEntries: (pending ?? []).map((e) => ({
      id: e.id,
      contestId: e.contest_id,
      contestTitle: titles.get(e.contest_id) ?? 'Contest',
      providerName: names.get(e.provider_id)?.name ?? 'Companion',
      providerUsername: names.get(e.provider_id)?.username ?? null,
      imageUrl: `${base}/storage/v1/object/public/contest-entries/${e.image_path}`,
      caption: e.caption,
      createdAt: e.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const db = svc();
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === 'create') {
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
    const theme = typeof body.theme === 'string' ? body.theme.trim().slice(0, 600) : '';
    const prizeCoins = Number.isFinite(body.prizeCoins) ? Math.max(0, Math.floor(body.prizeCoins)) : 0;
    const splitRaw = Array.isArray(body.prizeSplit) ? body.prizeSplit : [100];
    const prizeSplit = splitRaw
      .map((n: unknown) => Math.max(0, Math.floor(Number(n) || 0)))
      .filter((n: number) => n > 0)
      .slice(0, 5);
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (!title) return NextResponse.json({ error: 'A title is required' }, { status: 400 });
    if (!prizeSplit.length) return NextResponse.json({ error: 'Prize split is empty' }, { status: 400 });
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      return NextResponse.json({ error: 'End must be after the start' }, { status: 400 });
    }
    const { data, error } = await db
      .from('contests')
      .insert({
        title,
        theme,
        prize_coins: prizeCoins,
        prize_split: prizeSplit,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        created_by: admin.id,
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: 'Could not create the contest' }, { status: 500 });
    return NextResponse.json({ contestId: data.id });
  }

  if (action === 'entry') {
    const entryId = typeof body.entryId === 'string' ? body.entryId : '';
    const decision = body.decision;
    if (!entryId || !['approved', 'rejected', 'removed'].includes(decision)) {
      return NextResponse.json({ error: 'entryId and a valid decision required' }, { status: 400 });
    }
    const { error } = await db
      .from('contest_entries')
      .update({ status: decision })
      .eq('id', entryId);
    if (error) return NextResponse.json({ error: 'Could not save that decision' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'close') {
    const contestId = typeof body.contestId === 'string' ? body.contestId : '';
    if (!contestId) return NextResponse.json({ error: 'contestId required' }, { status: 400 });
    const { error } = await db
      .from('contests')
      .update({ status: 'closed' })
      .eq('id', contestId)
      .eq('status', 'open');
    if (error) return NextResponse.json({ error: 'Could not close the contest' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'pay') {
    const contestId = typeof body.contestId === 'string' ? body.contestId : '';
    if (!contestId) return NextResponse.json({ error: 'contestId required' }, { status: 400 });
    const { data: contest } = await db
      .from('contests')
      .select('id, title, prize_coins, prize_split, status')
      .eq('id', contestId)
      .maybeSingle();
    if (!contest) return NextResponse.json({ error: 'Contest not found' }, { status: 404 });
    if (contest.status === 'paid') {
      return NextResponse.json({ error: 'This contest has already been paid' }, { status: 400 });
    }
    if (contest.status !== 'closed') {
      return NextResponse.json({ error: 'Close the contest before paying winners' }, { status: 400 });
    }

    const { data: entries } = await db
      .from('contest_entries')
      .select('id, provider_id, created_at')
      .eq('contest_id', contestId)
      .eq('status', 'approved')
      .order('created_at', { ascending: true });
    const { data: vrows } = await db
      .from('contest_votes')
      .select('entry_id')
      .eq('contest_id', contestId);
    const counts = new Map<string, number>();
    for (const v of vrows ?? []) counts.set(v.entry_id, (counts.get(v.entry_id) ?? 0) + 1);
    const ranked = (entries ?? [])
      .map((e) => ({ ...e, votes: counts.get(e.id) ?? 0 }))
      .sort((a, b) => b.votes - a.votes || a.created_at.localeCompare(b.created_at));

    const split = Array.isArray(contest.prize_split) ? (contest.prize_split as number[]) : [100];
    const winners: { entryId: string; providerId: string; place: number; votes: number; coins: number }[] = [];
    for (let i = 0; i < Math.min(split.length, ranked.length); i++) {
      const coins = prizeForPlace(contest.prize_coins, split, i + 1);
      if (coins <= 0) continue;
      const w = ranked[i];
      const { error: creditErr } = await db.rpc('credit_coins', {
        p_user_id: w.provider_id,
        p_amount: coins,
        p_kind: 'contest_prize',
        p_ref: `contest:${contestId}:${w.id}`,
        p_meta: { place: i + 1 },
      });
      if (creditErr) {
        return NextResponse.json(
          { error: `Prize credit failed at place ${i + 1}. Nothing was marked paid, safe to retry.` },
          { status: 500 },
        );
      }
      winners.push({ entryId: w.id, providerId: w.provider_id, place: i + 1, votes: w.votes, coins });
    }

    const { error: markErr } = await db
      .from('contests')
      .update({ status: 'paid' })
      .eq('id', contestId);
    if (markErr) {
      return NextResponse.json(
        { error: 'Prizes were credited but the contest could not be marked paid. Do not pay again; the ledger refs prevent double payment.' },
        { status: 500 },
      );
    }

    // Tell each winner (bell row plus push, and email for this
    // money type). Best effort: the prizes already landed.
    for (const w of winners) {
      await notifyUsers({
        userIds: [w.providerId],
        type: 'contest_won',
        title: 'You won a contest',
        body: `You placed #${w.place} in "${contest.title}" and won ${w.coins} coins. The prize is in your wallet.`,
        link: `/perks/${contestId}`,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, winners });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
