import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { notifyUsers } from '@/lib/push-server';

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
    .single();
  return profile?.role === 'admin' || profile?.role === 'super_admin' ? user : null;
}

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface Party {
  id: string;
  name: string | null;
}

async function withParties(
  svc: ReturnType<typeof service>,
  rows: Record<string, unknown>[]
) {
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.client_id as string);
    ids.add(r.provider_id as string);
    if (r.dispute_by) ids.add(r.dispute_by as string);
  }
  const { data: profiles } = await svc
    .from('profiles')
    .select('id, display_name')
    .in('id', Array.from(ids));
  const byId = new Map<string, Party>(
    (profiles ?? []).map((p) => [p.id, { id: p.id, name: p.display_name }])
  );
  const party = (id: unknown): Party =>
    byId.get(id as string) ?? { id: id as string, name: null };
  return rows.map((r) => ({
    ...r,
    client: party(r.client_id),
    provider: party(r.provider_id),
    openedBy: r.dispute_by ? party(r.dispute_by) : null,
  }));
}

interface DisputeEventRow {
  id: string;
  connection_id: string;
  actor_id: string | null;
  kind: string;
  note: string | null;
  evidence_path: string | null;
  created_at: string;
}

// Attach each dispute's timeline (migration 037). Evidence paths are
// signed here with the service client, 1 hour expiry, because the
// dispute-evidence bucket is private and only admins can read all of it.
async function withEvents(
  svc: ReturnType<typeof service>,
  rows: Awaited<ReturnType<typeof withParties>>
) {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => (r as unknown as { id: string }).id);
  const { data: events } = await svc
    .from('dispute_events')
    .select('id, connection_id, actor_id, kind, note, evidence_path, created_at')
    .in('connection_id', ids)
    .order('created_at', { ascending: true });
  const list = (events ?? []) as unknown as DisputeEventRow[];

  const actorIds = Array.from(
    new Set(list.map((e) => e.actor_id).filter((v): v is string => !!v))
  );
  const { data: actorProfiles } = actorIds.length
    ? await svc.from('profiles').select('id, display_name').in('id', actorIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const actorById = new Map<string, Party>(
    (actorProfiles ?? []).map((p) => [p.id, { id: p.id, name: p.display_name }])
  );

  const enriched = await Promise.all(
    list.map(async (e) => {
      let evidence_url: string | null = null;
      if (e.evidence_path) {
        const { data: signed } = await svc.storage
          .from('dispute-evidence')
          .createSignedUrl(e.evidence_path, 3600);
        evidence_url = signed?.signedUrl ?? null;
      }
      return {
        ...e,
        actor: e.actor_id ? actorById.get(e.actor_id) ?? { id: e.actor_id, name: null } : null,
        evidence_url,
      };
    })
  );

  const byConnection = new Map<string, typeof enriched>();
  for (const e of enriched) {
    const bucket = byConnection.get(e.connection_id) ?? [];
    bucket.push(e);
    byConnection.set(e.connection_id, bucket);
  }
  return rows.map((r) => ({
    ...r,
    events: byConnection.get((r as unknown as { id: string }).id) ?? [],
  }));
}

/**
 * GET /api/admin/disputes
 * Open disputes first, then the most recently resolved ones.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const svc = service();
  const cols =
    'id, client_id, provider_id, fee_ngn, status, fee_state, dispute_reason, dispute_by, dispute_opened_at, dispute_resolved_at, dispute_outcome, created_at';
  const { data: open } = await svc
    .from('connections')
    .select(cols)
    .eq('fee_state', 'disputed')
    .order('dispute_opened_at', { ascending: true });
  const { data: resolved } = await svc
    .from('connections')
    .select(cols)
    .not('dispute_resolved_at', 'is', null)
    .order('dispute_resolved_at', { ascending: false })
    .limit(20);

  const openRows = await withParties(svc, (open ?? []) as unknown as Record<string, unknown>[]);
  const resolvedRows = await withParties(
    svc,
    (resolved ?? []) as unknown as Record<string, unknown>[]
  );
  return NextResponse.json({
    open: await withEvents(svc, openRows),
    resolved: await withEvents(svc, resolvedRows),
  });
}

/**
 * POST /api/admin/disputes
 * Body: { connection_id, outcome: 'refunded' | 'released' }
 * 'refunded' closes the connection and marks the fee for return to
 * the client through the original payment rail. 'released' ends the
 * protection window and the fee stands.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    connection_id?: string;
    outcome?: string;
  } | null;
  if (!body?.connection_id || (body.outcome !== 'refunded' && body.outcome !== 'released')) {
    return NextResponse.json(
      { error: 'connection_id and a valid outcome are required' },
      { status: 400 }
    );
  }

  const svc = service();
  const { data: conn } = await svc
    .from('connections')
    .select('id, client_id, provider_id, fee_state')
    .eq('id', body.connection_id)
    .maybeSingle();
  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  if (conn.fee_state !== 'disputed') {
    return NextResponse.json({ error: 'This dispute is already resolved' }, { status: 409 });
  }

  const patch =
    body.outcome === 'refunded'
      ? {
          status: 'refunded',
          fee_state: 'refunded',
          dispute_outcome: 'refunded',
          dispute_resolved_at: new Date().toISOString(),
        }
      : {
          fee_state: 'released',
          dispute_outcome: 'released',
          dispute_resolved_at: new Date().toISOString(),
        };

  const { data: updated, error } = await svc
    .from('connections')
    .update(patch)
    .eq('id', conn.id)
    .eq('fee_state', 'disputed')
    .select('id')
    .maybeSingle();
  if (error || !updated) {
    return NextResponse.json({ error: 'Could not resolve this dispute' }, { status: 500 });
  }

  // Close out the dispute timeline (migration 037).
  await svc.from('dispute_events').insert({
    connection_id: conn.id,
    actor_id: admin.id,
    kind: 'resolved',
    note: body.outcome,
  });

  await notifyUsers({
    userIds: [conn.client_id, conn.provider_id],
    type: 'dispute_resolved',
    title: body.outcome === 'refunded' ? 'Dispute resolved: fee refunded' : 'Dispute resolved: fee released',
    body:
      body.outcome === 'refunded'
        ? 'Our team reviewed the dispute and refunded 85% of the connection fee. The connection is closed.'
        : 'Our team reviewed the dispute and the connection fee stands. The connection stays open.',
    link: '/messages',
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
