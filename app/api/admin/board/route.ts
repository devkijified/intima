import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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

/**
 * GET /api/admin/board
 * Every board request, newest first, with the client's name, the
 * picked companion, and the response count, for oversight and
 * refund handling.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 });

  const svc = service();
  const { data: rows } = await svc
    .from('board_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  const requests = rows ?? [];

  const peopleIds = [
    ...new Set(
      requests.flatMap((r) =>
        [r.client_id, r.picked_provider_id].filter((v): v is string => !!v)
      )
    ),
  ];
  const people = new Map<string, { display_name: string | null; username: string | null }>();
  if (peopleIds.length > 0) {
    const { data } = await svc
      .from('profiles')
      .select('id, display_name, username')
      .in('id', peopleIds);
    for (const p of data ?? []) {
      people.set(p.id, { display_name: p.display_name, username: p.username });
    }
  }

  const counts = new Map<string, number>();
  if (requests.length > 0) {
    const { data } = await svc
      .from('board_responses')
      .select('request_id')
      .in('request_id', requests.map((r) => r.id));
    for (const r of data ?? []) {
      counts.set(r.request_id, (counts.get(r.request_id) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      city: r.city,
      service_type: r.service_type,
      proposed_rate_ngn: r.proposed_rate_ngn,
      timing: r.timing,
      status: r.status,
      refund_state: r.refund_state,
      payment_rail: r.payment_rail,
      payment_ref: r.payment_ref,
      expires_at: r.expires_at,
      created_at: r.created_at,
      responses: counts.get(r.id) ?? 0,
      client: people.get(r.client_id) ?? null,
      picked: r.picked_provider_id ? people.get(r.picked_provider_id) ?? null : null,
      connection_id: r.connection_id,
    })),
  });
}
