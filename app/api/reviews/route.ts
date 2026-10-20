import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function publishDue(supabase: ReturnType<typeof createClient>) {
  // Double-blind release: flips pending reviews whose pair is complete
  // or whose 72 hour window has passed. Best effort.
  try {
    await supabase.rpc('publish_due_reviews');
  } catch {
    /* the read paths call it too */
  }
}

/**
 * GET /api/reviews?connection_id=...
 * My review state for one connection: what I wrote, whether the other
 * side has written theirs (never their words while blind), and their
 * review of me once both are published.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const connectionId = req.nextUrl.searchParams.get('connection_id');
  if (!connectionId) {
    return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });
  }

  await publishDue(supabase);
  const svc = service();

  const { data: conn } = await svc
    .from('connections')
    .select('id, client_id, provider_id, status')
    .eq('id', connectionId)
    .maybeSingle();
  if (!conn || (conn.client_id !== user.id && conn.provider_id !== user.id)) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  const { data: rows } = await svc
    .from('reviews')
    .select('id, reviewer_id, rating, comment, status, created_at')
    .eq('connection_id', connectionId);

  const mine = (rows ?? []).find((r) => r.reviewer_id === user.id) ?? null;
  const theirs = (rows ?? []).find((r) => r.reviewer_id !== user.id) ?? null;

  return NextResponse.json({
    canReview: conn.status === 'active',
    mine: mine
      ? { rating: mine.rating, comment: mine.comment, status: mine.status, created_at: mine.created_at }
      : null,
    counterpartSubmitted: !!theirs,
    counterpartReview:
      theirs && theirs.status === 'published'
        ? { rating: theirs.rating, comment: theirs.comment, created_at: theirs.created_at }
        : null,
  });
}

/**
 * POST /api/reviews
 * Body: { connection_id, rating, comment? }
 * Writes (or edits, while still blind) the caller's review of the other
 * party. The comment passes the same contact-leak scan as bios and
 * broadcasts: reviews are public once published, so no handles or
 * numbers may ride along.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    connection_id?: string;
    rating?: number;
    comment?: string;
  } | null;
  if (!body?.connection_id) {
    return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });
  }
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Pick a rating from 1 to 5 stars' }, { status: 400 });
  }
  const comment = (body.comment ?? '').trim().slice(0, 600);
  if (comment) {
    const scan = scanForLeaks(comment);
    if (!scan.clean) {
      return NextResponse.json({ error: leakWarning(scan.leaks) }, { status: 400 });
    }
  }

  const svc = service();
  const { data: conn } = await svc
    .from('connections')
    .select('id, client_id, provider_id, status')
    .eq('id', body.connection_id)
    .maybeSingle();
  if (!conn || (conn.client_id !== user.id && conn.provider_id !== user.id)) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }
  if (conn.status !== 'active') {
    return NextResponse.json(
      { error: 'Reviews open once a connection is active' },
      { status: 400 }
    );
  }
  const reviewee = conn.client_id === user.id ? conn.provider_id : conn.client_id;

  const { data: existing } = await svc
    .from('reviews')
    .select('id, status')
    .eq('connection_id', conn.id)
    .eq('reviewer_id', user.id)
    .maybeSingle();

  if (existing && existing.status === 'published') {
    return NextResponse.json(
      { error: 'Your review is already published and can no longer be changed' },
      { status: 400 }
    );
  }

  if (existing) {
    const { error } = await svc
      .from('reviews')
      .update({ rating, comment: comment || null })
      .eq('id', existing.id);
    if (error) return NextResponse.json({ error: 'Could not save your review' }, { status: 500 });
  } else {
    const { error } = await svc.from('reviews').insert({
      provider_id: conn.provider_id,
      client_id: conn.client_id,
      connection_id: conn.id,
      reviewer_id: user.id,
      reviewee_id: reviewee,
      rating,
      comment: comment || null,
      status: 'pending',
    });
    if (error) return NextResponse.json({ error: 'Could not save your review' }, { status: 500 });
  }

  await publishDue(supabase);

  const { data: mine } = await svc
    .from('reviews')
    .select('rating, comment, status, created_at')
    .eq('connection_id', conn.id)
    .eq('reviewer_id', user.id)
    .maybeSingle();
  const { data: theirs } = await svc
    .from('reviews')
    .select('id, status')
    .eq('connection_id', conn.id)
    .neq('reviewer_id', user.id)
    .maybeSingle();

  return NextResponse.json({
    success: true,
    mine,
    counterpartSubmitted: !!theirs,
    published: mine?.status === 'published',
  });
}
