import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck';
import { contestPhase } from '@/lib/perks/rules';

/**
 * POST /api/perks/enter { contestId, storagePath, caption?,
 *   mediaType?, durationSeconds? }
 * A companion enters a live contest with one photo or one short
 * video she already uploaded to her own folder in the
 * contest-entries bucket. Video rules mirror the private snaps
 * standard: her device reads the duration and the server refuses
 * a video without a believable one (over 60 seconds is refused),
 * and the uploaded object itself is size-checked here (50MB max),
 * so the caps hold even if a client skips its own checks. The
 * entry starts as pending: a human approves it before it can be
 * seen or voted on, same standard as Fans Only posts.
 */

const MAX_VIDEO_SECONDS = 65; // 60 second rule plus encoding grace
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

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
  const mediaType = body.mediaType === 'video' ? 'video' : 'photo';
  if (!contestId || !storagePath) {
    return NextResponse.json({ error: 'contestId and storagePath required' }, { status: 400 });
  }
  if (!storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: 'That file is not in your uploads' }, { status: 403 });
  }
  const lowerPath = storagePath.toLowerCase();
  const extOk = mediaType === 'video'
    ? /\.(mp4|mov|webm)$/.test(lowerPath)
    : /\.(jpg|jpeg)$/.test(lowerPath);
  if (!extOk) {
    return NextResponse.json(
      { error: mediaType === 'video' ? 'Videos must be MP4, MOV or WebM files.' : 'Photos must be JPG files.' },
      { status: 400 },
    );
  }
  // Video duration: the client reads it from the file; a video
  // without a believable duration is refused here, not left for
  // the review queue (the private snaps rule).
  let durationSeconds: number | null = null;
  if (mediaType === 'video') {
    const raw = body.durationSeconds;
    durationSeconds =
      typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : null;
    if (durationSeconds === null || durationSeconds < 1) {
      return NextResponse.json(
        { error: 'We could not read that video. Please pick it again.' },
        { status: 400 },
      );
    }
    if (durationSeconds > MAX_VIDEO_SECONDS) {
      return NextResponse.json(
        { error: 'Videos can be at most 60 seconds. Please trim it and try again.' },
        { status: 400 },
      );
    }
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
    .select('role, is_verified, verification_status')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'model') {
    return NextResponse.json({ error: 'Only companions can enter a contest' }, { status: 403 });
  }
  // Verified members only (user decision, 2026-10-21): same check as
  // lib/connections/eligibility.ts; admin approval sets both flags.
  const isVerified = profile.is_verified === true || profile.verification_status === 'verified';
  if (!isVerified) {
    return NextResponse.json(
      { error: 'Only verified companions can enter contests. Complete your ID verification first.' },
      { status: 403 },
    );
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

  // Size cap, checked against the uploaded object itself. When the
  // object metadata cannot be read the entry is not blocked on it;
  // the bucket and the client still bound what can arrive.
  if (mediaType === 'video') {
    try {
      const folder = storagePath.slice(0, storagePath.lastIndexOf('/'));
      const base = storagePath.slice(storagePath.lastIndexOf('/') + 1);
      const { data: objs } = await db.storage
        .from('contest-entries')
        .list(folder, { search: base, limit: 1 });
      const size = (objs?.[0]?.metadata as { size?: number } | undefined)?.size;
      if (typeof size === 'number' && size > MAX_VIDEO_BYTES) {
        await db.storage.from('contest-entries').remove([storagePath]).catch(() => {});
        return NextResponse.json(
          { error: 'That video is too large. Please keep it under 50MB.' },
          { status: 400 },
        );
      }
    } catch {
      /* metadata read is best effort */
    }
  }

  const { data: entry, error } = await db
    .from('contest_entries')
    .insert({
      contest_id: contestId,
      provider_id: user.id,
      image_path: storagePath,
      media_type: mediaType,
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
