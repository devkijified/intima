import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck';
import { contestPhase } from '@/lib/perks/rules';

/**
 * POST /api/perks/enter { contestId, storagePath, caption? }
 * A companion enters a live contest with one photo she already
 * uploaded to her own folder in the contest-entries bucket. The
 * entry starts as pending: a human approves it before it can be
 * seen or voted on, same standard as Fans Only posts.
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
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const contestId = typeof body.contestId === 'string' ? body.contestId : '';
  const storagePath = typeof body.storagePath === 'string' ? body.storagePath : '';
  const caption = typeof body.caption === 'string' ? body.caption.trim().slice(0, 300) : '';
  if (!contestId || !storagePath) {
    return NextResponse.json({ error: 'contestId and storagePath required' }, { status: 400 });
  }
  if (!storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: 'That photo is not in your uploads' }, { status: 403 });
  }
  if (caption) {
    const scan = scanForLeaks(caption);
    if (!scan.clean) {
      return NextResponse.json({ error: leakWarning(scan.leaks) }, { status: 400 });
    }
  }

  const db = svc();
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'model') {
    return NextResponse.json({ error: 'Only companions can enter a contest' }, { status: 403 });
  }

  const { data: contest } = await db
    .from('contests')
    .select('id, starts_at, ends_at, status')
    .eq('id', contestId)
    .maybeSingle();
  if (!contest) {
    return NextResponse.json({ error: 'Contest not found' }, { status: 404 });
  }
  if (contestPhase(contest) !== 'live') {
    return NextResponse.json({ error: 'This contest is not open for entries right now' }, { status: 400 });
  }

  const { data: entry, error } = await db
    .from('contest_entries')
    .insert({
      contest_id: contestId,
      provider_id: user.id,
      image_path: storagePath,
      caption,
      status: 'pending',
    })
    .select('id, status')
    .single();
  if (error) {
    if (String(error.message).includes('contest_entries_contest_id_provider_id_key') || error.code === '23505') {
      return NextResponse.json({ error: 'You already entered this contest' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Could not save your entry' }, { status: 500 });
  }
  return NextResponse.json({ entry: { id: entry.id, status: entry.status } });
}
