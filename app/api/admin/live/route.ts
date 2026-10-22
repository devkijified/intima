import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  return profile?.role === 'admin' || profile?.role === 'super_admin' ? user : null;
}

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/admin/live: the latest streams of every status (live,
 * scheduled, suspended, ended) with their host's name and username.
 * The write goes through the service client on purpose: live_sessions
 * RLS only lets a stream's own host update it, so the admin page's
 * old browser-side writes silently changed nothing for anyone else's
 * stream. Every admin write lands here instead, behind the role
 * check above.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const svc = service();
  const { data, error } = await svc
    .from('live_sessions')
    .select('id, provider_id, title, price_ngn, viewer_count, status, featured, started_at, scheduled_for, ended_at')
    .order('started_at', { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ error: 'Could not load the streams. Please try again.' }, { status: 500 });
  }

  const list = (data ?? []) as Record<string, unknown>[];
  if (list.length > 0) {
    const { data: profs } = await svc
      .from('profiles')
      .select('id, display_name, username')
      .in('id', list.map((s) => s.provider_id as string));
    const byId = new Map((profs ?? []).map((p) => [p.id, p]));
    for (const s of list) {
      s.provider_name = byId.get(s.provider_id as string)?.display_name ?? 'Unknown';
      s.provider_username = byId.get(s.provider_id as string)?.username ?? null;
    }
  }

  return NextResponse.json({ streams: list });
}

type LiveAction = 'end' | 'suspend' | 'restore' | 'feature' | 'unfeature';

const ACTIONS: Record<LiveAction, Record<string, unknown>> = {
  end: { status: 'ended' },
  suspend: { status: 'suspended' },
  restore: { status: 'live', ended_at: null },
  feature: { featured: true },
  unfeature: { featured: false },
};

const ACTION_LABEL: Record<LiveAction, string> = {
  end: 'stream_ended',
  suspend: 'stream_suspended',
  restore: 'stream_restored',
  feature: 'stream_featured',
  unfeature: 'stream_unfeatured',
};

/**
 * POST /api/admin/live
 * Body: { id, action: 'end' | 'suspend' | 'restore' | 'feature' | 'unfeature' }
 * Ending stamps ended_at, the same transition the host's own end
 * flow writes, so viewers and listings treat it identically.
 * Restoring clears the ended stamp so the room can be rejoined.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; action?: string };
  const patch = body.action ? { ...ACTIONS[body.action as LiveAction] } : undefined;
  if (!body.id || !patch || !body.action) {
    return NextResponse.json({ error: 'That action is not available for a stream.' }, { status: 400 });
  }
  if (body.action === 'end') {
    patch.ended_at = new Date().toISOString();
  }

  const svc = service();
  const { data: updated, error } = await svc
    .from('live_sessions')
    .update(patch)
    .eq('id', body.id)
    .select('id')
    .maybeSingle();
  if (error || !updated) {
    return NextResponse.json({ error: 'That change did not save. Please try again.' }, { status: 500 });
  }

  await svc.from('admin_audit_logs').insert({
    admin_id: admin.id,
    action: ACTION_LABEL[body.action as LiveAction],
    target_type: 'live_session',
    target_id: body.id,
    details: { stream_action: body.action },
  });

  return NextResponse.json({ ok: true });
}
