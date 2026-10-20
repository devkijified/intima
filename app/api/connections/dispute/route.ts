import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notifyUsers } from '@/lib/push-server';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/connections/dispute
 * Body: { connection_id, reason }
 * Opens a dispute on the connection fee while it is still inside its
 * 24 hour protection window (fee_state 'held'). Either party may open
 * one. The fee stays frozen in 'disputed' until an admin resolves it
 * to a refund or a release. Chat stays open throughout.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    connection_id?: string;
    reason?: string;
  } | null;
  if (!body?.connection_id) {
    return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });
  }
  const reason = (body.reason ?? '').trim().slice(0, 1000);
  if (reason.length < 10) {
    return NextResponse.json(
      { error: 'Tell us what happened in a sentence or two, so the team can review it.' },
      { status: 400 }
    );
  }

  const svc = service();
  const { data: conn } = await svc
    .from('connections')
    .select('id, client_id, provider_id, status, fee_state, dispute_deadline')
    .eq('id', body.connection_id)
    .maybeSingle();
  if (!conn || (conn.client_id !== user.id && conn.provider_id !== user.id)) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }
  if (conn.status !== 'active') {
    return NextResponse.json({ error: 'This connection is not active' }, { status: 400 });
  }
  if (conn.fee_state === 'disputed') {
    return NextResponse.json({ error: 'A dispute is already open on this connection' }, { status: 409 });
  }
  if (conn.fee_state !== 'held') {
    return NextResponse.json(
      { error: 'The protection window for this fee has closed' },
      { status: 400 }
    );
  }
  if (conn.dispute_deadline && new Date(conn.dispute_deadline).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'The 24 hour protection window has ended for this connection' },
      { status: 400 }
    );
  }

  const { data: updated, error } = await svc
    .from('connections')
    .update({
      fee_state: 'disputed',
      dispute_reason: reason,
      dispute_by: user.id,
      dispute_opened_at: new Date().toISOString(),
    })
    .eq('id', conn.id)
    .eq('fee_state', 'held')
    .select('id')
    .maybeSingle();
  if (error || !updated) {
    return NextResponse.json(
      { error: 'Could not open the dispute. It may already be open.' },
      { status: 409 }
    );
  }

  // Tell the admins there is a fee to review.
  const { data: admins } = await svc
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'super_admin']);
  if (admins && admins.length > 0) {
    await notifyUsers({
      userIds: admins.map((a) => a.id),
      type: 'dispute_opened',
      title: 'New fee dispute',
      body: 'A connection fee has been disputed and is waiting for review.',
      link: '/admin/disputes',
    }).catch(() => {});
  }

  // And the other party, so it never lands as a surprise.
  const otherId = conn.client_id === user.id ? conn.provider_id : conn.client_id;
  await notifyUsers({
    userIds: [otherId],
    type: 'dispute_opened',
    title: 'A dispute was opened',
    body: 'A dispute was opened on your connection fee. Our team will review it; chat stays open.',
    link: `/messages/${conn.id}`,
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
