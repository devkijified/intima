import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { notifyUsers } from '@/lib/push-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/verifications
 * Body: { id, approve: boolean, notes? }
 *
 * The server-side home for verification decisions. The admin
 * verifications page historically wrote the verifications row, the
 * profile sync, and the audit log straight from the browser, which
 * left no server moment to notify the companion. This route performs
 * the exact same writes, in the same order, then tells the user the
 * decision (bell row plus push, and email: verification decisions
 * are in EMAIL_TYPES). A reason is required when rejecting, matching
 * the page's rule. The page should post here instead of writing
 * directly; until it does, both paths write identical state.
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

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    approve?: boolean;
    notes?: string;
  } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const approve = body?.approve === true;
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (!approve && !notes) {
    return NextResponse.json(
      { error: 'A reason is required when rejecting a verification.' },
      { status: 400 },
    );
  }

  const db = svc();
  const { data: row } = await db
    .from('verifications')
    .select('id, provider_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Verification not found' }, { status: 404 });
  if (row.status !== 'pending') {
    return NextResponse.json({ error: 'This verification was already decided' }, { status: 400 });
  }

  const status = approve ? 'approved' : 'rejected';
  const { error } = await db
    .from('verifications')
    .update({
      status,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      review_notes: approve ? notes || null : notes,
    })
    .eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not save that decision' }, { status: 500 });

  // Keep the public profile in sync. A badge must never show before approval.
  const { error: profileError } = await db
    .from('profiles')
    .update({
      verification_status: approve ? 'verified' : 'rejected',
      is_verified: approve,
    })
    .eq('id', row.provider_id);
  if (profileError) {
    return NextResponse.json({ error: 'Decision saved, but the profile sync failed' }, { status: 500 });
  }

  await db.from('admin_audit_logs').insert({
    admin_id: admin.id,
    action: approve ? 'verification_approved' : 'verification_rejected',
    target_type: 'verification',
    target_id: id,
    details: { provider_id: row.provider_id, notes: notes || null },
  });

  await notifyUsers({
    userIds: [row.provider_id],
    type: approve ? 'verification_approved' : 'verification_rejected',
    title: approve ? 'You are verified' : 'Verification not approved',
    body: approve
      ? 'Your ID verification was approved. Your verified badge is now live on your profile.'
      : `Your ID verification was not approved. Reason: ${notes} You can check the guidance and submit again from the verification page.`,
    link: '/verification',
  }).catch(() => {});

  return NextResponse.json({ ok: true, status });
}
