import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Comic series follows ("Notify me").
 * POST { comicId } follows, DELETE { comicId } unfollows,
 * PATCH { comicId } marks the series seen (clears its badge share).
 * GET returns the signed-in member's followed series ids plus the
 * total unseen episode count across them: episodes published after
 * the later of the follow date and the last time they opened the
 * series. Guests get an empty, unsigned answer so nav can call it
 * without auth noise.
 */

async function unseenFor(
  supabase: ReturnType<typeof createClient>,
  follows: Array<{ comic_id: string; created_at: string; last_seen_at: string }>,
): Promise<number> {
  let total = 0;
  await Promise.all(
    follows.map(async (f) => {
      const since = f.last_seen_at > f.created_at ? f.last_seen_at : f.created_at;
      const { count } = await supabase
        .from('comic_episodes')
        .select('*', { count: 'exact', head: true })
        .eq('comic_id', f.comic_id)
        .eq('status', 'published')
        .gt('published_at', since);
      total += count ?? 0;
    }),
  );
  return total;
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ signedIn: false, following: [], unseenTotal: 0 });

  const { data: follows } = await supabase
    .from('comic_follows')
    .select('comic_id, created_at, last_seen_at')
    .eq('user_id', user.id);
  const rows = (follows ?? []) as Array<{ comic_id: string; created_at: string; last_seen_at: string }>;
  const unseenTotal = await unseenFor(supabase, rows);
  return NextResponse.json({
    signedIn: true,
    following: rows.map((f) => f.comic_id),
    unseenTotal,
  });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });

  const { comicId } = await req.json().catch(() => ({}));
  if (typeof comicId !== 'string' || !comicId) {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 400 });
  }
  const { error } = await supabase
    .from('comic_follows')
    .upsert(
      { user_id: user.id, comic_id: comicId },
      { onConflict: 'user_id,comic_id', ignoreDuplicates: true },
    );
  if (error) {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, following: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });

  const { comicId } = await req.json().catch(() => ({}));
  if (typeof comicId !== 'string' || !comicId) {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 400 });
  }
  const { error } = await supabase
    .from('comic_follows')
    .delete()
    .eq('user_id', user.id)
    .eq('comic_id', comicId);
  if (error) {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, following: false });
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });

  const { comicId } = await req.json().catch(() => ({}));
  if (typeof comicId !== 'string' || !comicId) {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 400 });
  }
  // No row exists for non-followers, so this quietly does nothing
  // for them; the badge only ever counts followed series.
  await supabase
    .from('comic_follows')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('comic_id', comicId);
  return NextResponse.json({ success: true });
}
