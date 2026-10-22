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
 * POST /api/connections/dispute-evidence
 * Body: { connection_id, path, note? }
 * Records one piece of evidence on an open dispute timeline. The image
 * itself is uploaded by the browser straight to the private
 * dispute-evidence bucket, under the caller's own <uid>/ folder; this
 * route only verifies the claim and appends the timeline entry.
 * `note` is the caption for the evidence.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    connection_id?: string;
    path?: string;
    note?: string;
  } | null;
  if (
    !body ||
    typeof body.connection_id !== 'string' || !body.connection_id ||
    typeof body.path !== 'string' || !body.path ||
    (body.note !== undefined && typeof body.note !== 'string')
  ) {
    return NextResponse.json(
      { error: 'connection_id and path are required' },
      { status: 400 }
    );
  }

  // The path must live in the caller's own folder in dispute-evidence:
  // <uid>/<file>. Folder traversal segments are never accepted.
  const path = body.path.trim();
  const prefix = `${user.id}/`;
  if (
    !path.startsWith(prefix) ||
    path.length <= prefix.length ||
    path.split('/').some((seg) => seg === '..' || seg === '.')
  ) {
    return NextResponse.json({ error: 'Invalid evidence path' }, { status: 400 });
  }
  const caption = (body.note ?? '').trim().slice(0, 1000) || null;

  const svc = service();
  const { data: conn } = await svc
    .from('connections')
    .select('id, client_id, provider_id, fee_state')
    .eq('id', body.connection_id)
    .maybeSingle();
  if (!conn || (conn.client_id !== user.id && conn.provider_id !== user.id)) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }
  if (conn.fee_state !== 'disputed') {
    return NextResponse.json(
      { error: 'Evidence can only be added while a dispute is open' },
      { status: 400 }
    );
  }

  const { data: event, error } = await svc
    .from('dispute_events')
    .insert({
      connection_id: conn.id,
      actor_id: user.id,
      kind: 'evidence',
      note: caption,
      evidence_path: path,
    })
    .select('id, kind, note, evidence_path, actor_id, created_at')
    .maybeSingle();
  if (error || !event) {
    return NextResponse.json({ error: 'Could not save the evidence' }, { status: 500 });
  }

  const otherId = conn.client_id === user.id ? conn.provider_id : conn.client_id;
  // Notification type: the notifications table still carries the type
  // check from migration 013, and the dispute routes already notify
  // with 'dispute_opened' and 'dispute_resolved'. Evidence is part of
  // the open dispute, so it reuses 'dispute_opened' rather than
  // inventing a 'dispute_evidence' value that the check would reject.
  await notifyUsers({
    userIds: [otherId],
    type: 'dispute_opened',
    title: 'New dispute evidence',
    body: 'The other side added evidence to the open dispute on your connection fee.',
    link: `/messages/${conn.id}`,
  }).catch(() => {});

  return NextResponse.json({ success: true, event });
}
