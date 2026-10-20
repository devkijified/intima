import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Admin human review for private snaps (migration 050).
 *
 * Every snap a creator uploads starts as review_status 'pending'.
 * Nothing counts toward the fan club content rules and nothing is
 * shown to fans until a human on the admin team approves it here.
 * Media lives in the private 'private-snaps' bucket, so previews on
 * this route are service-role signed URLs with a 1 hour TTL, the
 * same pattern as /api/private-snaps.
 *
 * GET:  the pending queue, oldest first, with creator names and a
 *       signed preview URL per snap.
 * POST: { snapId, decision: 'approved' | 'rejected', reason? }
 *       records the decision, the reviewing admin and the time.
 *       A rejection stores the reason so the creator can be told
 *       what to fix.
 */

const BUCKET = 'private-snaps';
const SIGNED_URL_TTL_SECONDS = 3600;

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
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface PendingSnapRow {
  id: string;
  provider_id: string;
  storage_path: string;
  media_type: string;
  caption: string | null;
  collection: string;
  duration_seconds: number | null;
  created_at: string;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const db = svc();
  const { data: rows, error } = await db
    .from('private_snaps')
    .select(
      'id, provider_id, storage_path, media_type, caption, collection, duration_seconds, created_at'
    )
    .eq('review_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: 'Could not load the review queue' }, { status: 500 });
  }
  const snaps = (rows ?? []) as PendingSnapRow[];
  if (snaps.length === 0) return NextResponse.json({ snaps: [] });

  // Creator names via a second query (no embed assumptions).
  const providerIds = Array.from(new Set(snaps.map((s) => s.provider_id)));
  const { data: profiles } = await db
    .from('profiles')
    .select('id, display_name, username')
    .in('id', providerIds);
  const nameById = new Map<string, { displayName: string | null; username: string | null }>();
  for (const p of (profiles ?? []) as any[]) {
    nameById.set(p.id, { displayName: p.display_name ?? null, username: p.username ?? null });
  }

  // Signed preview URLs for the private bucket.
  const { data: signed } = await db.storage
    .from(BUCKET)
    .createSignedUrls(
      snaps.map((s) => s.storage_path),
      SIGNED_URL_TTL_SECONDS
    );
  const urlByPath = new Map<string, string>();
  for (const s of signed ?? []) {
    if (s.path && s.signedUrl && !s.error) urlByPath.set(s.path, s.signedUrl);
  }

  return NextResponse.json({
    snaps: snaps.map((s) => ({
      id: s.id,
      providerId: s.provider_id,
      providerName: nameById.get(s.provider_id)?.displayName ?? null,
      providerUsername: nameById.get(s.provider_id)?.username ?? null,
      mediaType: s.media_type,
      caption: s.caption,
      collection: s.collection,
      durationSeconds: s.duration_seconds,
      createdAt: s.created_at,
      url: urlByPath.get(s.storage_path) ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    snapId?: unknown;
    decision?: unknown;
    reason?: unknown;
  } | null;

  const snapId = typeof body?.snapId === 'string' ? body.snapId.trim() : '';
  const decision = body?.decision;
  if (!snapId || (decision !== 'approved' && decision !== 'rejected')) {
    return NextResponse.json(
      { error: 'snapId and a decision of approved or rejected are required' },
      { status: 400 }
    );
  }
  if (body?.reason !== undefined && typeof body.reason !== 'string') {
    return NextResponse.json({ error: 'reason must be text' }, { status: 400 });
  }
  const reason =
    decision === 'rejected' && typeof body?.reason === 'string'
      ? body.reason.trim().slice(0, 300) || null
      : null;

  const db = svc();
  const { data: existing } = await db
    .from('private_snaps')
    .select('id')
    .eq('id', snapId)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'Snap not found' }, { status: 404 });
  }

  const { data: updated, error } = await db
    .from('private_snaps')
    .update({
      review_status: decision,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      reject_reason: reason,
    })
    .eq('id', snapId)
    .select('id, review_status, reviewed_by, reviewed_at, reject_reason')
    .single();
  if (error || !updated) {
    return NextResponse.json({ error: 'Could not save the decision' }, { status: 500 });
  }

  return NextResponse.json({
    snap: {
      id: updated.id,
      reviewStatus: updated.review_status,
      reviewedBy: updated.reviewed_by,
      reviewedAt: updated.reviewed_at,
      rejectReason: updated.reject_reason,
    },
  });
}
