import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NIGERIA_CITIES } from '@/lib/cities';
import { isServiceType, SERVICE_TYPE_LABELS, type ServiceType } from '@/lib/connections/serviceType';
import {
  BOARD_TIMING_LABELS,
  isBoardTiming,
  isValidBoardRate,
  isVerifiedProvider,
  settleOpenIfPaid,
  expireIfDue,
  clientTrustSummary,
  type BoardRequestRow,
} from '@/lib/board/board';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface ResponseRow {
  id: string;
  request_id: string;
  provider_id: string | null;
  author_role: string;
  kind: string;
  rate_ngn: number | null;
  created_at: string;
}

async function responsesFor(
  svc: ReturnType<typeof service>,
  requestIds: string[]
): Promise<Map<string, ResponseRow[]>> {
  const map = new Map<string, ResponseRow[]>();
  if (requestIds.length === 0) return map;
  const { data } = await svc
    .from('board_responses')
    .select('*')
    .in('request_id', requestIds)
    .order('created_at', { ascending: true });
  for (const r of (data ?? []) as ResponseRow[]) {
    const list = map.get(r.request_id) ?? [];
    list.push(r);
    map.set(r.request_id, list);
  }
  return map;
}

async function providerSummaries(
  svc: ReturnType<typeof service>,
  ids: string[]
): Promise<Map<string, { display_name: string | null; username: string | null; avatar_url: string | null; verified: boolean }>> {
  const map = new Map();
  if (ids.length === 0) return map;
  const { data } = await svc
    .from('profiles')
    .select('id, display_name, username, avatar_url, is_verified, verification_status')
    .in('id', [...new Set(ids)]);
  for (const p of data ?? []) {
    map.set(p.id, {
      display_name: p.display_name,
      username: p.username,
      avatar_url: p.avatar_url,
      verified: p.is_verified === true || p.verification_status === 'verified',
    });
  }
  return map;
}

function dto(
  row: BoardRequestRow,
  responses: ResponseRow[],
  providers: Map<string, { display_name: string | null; username: string | null; avatar_url: string | null; verified: boolean }>
) {
  return {
    id: row.id,
    city: row.city,
    service_type: row.service_type,
    serviceLabel: SERVICE_TYPE_LABELS[row.service_type as ServiceType] ?? row.service_type,
    proposed_rate_ngn: row.proposed_rate_ngn,
    timing: row.timing,
    timingLabel: BOARD_TIMING_LABELS[row.timing as keyof typeof BOARD_TIMING_LABELS] ?? row.timing,
    status: row.status,
    refund_state: row.refund_state,
    expires_at: row.expires_at,
    created_at: row.created_at,
    picked_provider_id: row.picked_provider_id,
    connection_id: row.connection_id,
    responses: responses.map((r) => ({
      id: r.id,
      provider_id: r.provider_id,
      author_role: r.author_role,
      kind: r.kind,
      rate_ngn: r.rate_ngn,
      created_at: r.created_at,
      provider: r.provider_id ? providers.get(r.provider_id) ?? null : null,
    })),
  };
}

/**
 * GET /api/board/requests
 * Clients get their own requests with every response. Companions
 * get the open board for their city (clients stay anonymous: only
 * trust signals ride along) plus a summary of their own responses.
 * Reads settle paid requests and expire due ones lazily, so money
 * movement never waits on the cron.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const svc = service();
  const { data: me } = await svc
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const role = me?.role ?? 'client';

  // Mine, settled and expired lazily.
  const { data: mineRaw } = await svc
    .from('board_requests')
    .select('*')
    .eq('client_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);
  let mine: BoardRequestRow[] = [];
  for (const row of (mineRaw ?? []) as BoardRequestRow[]) {
    let r = await settleOpenIfPaid(svc, row);
    r = await expireIfDue(svc, r);
    mine.push(r);
  }
  const mineResponses = await responsesFor(svc, mine.map((r) => r.id));
  const mineProviderIds = [...mineResponses.values()].flat().map((r) => r.provider_id).filter((v): v is string => !!v);
  const mineProviders = await providerSummaries(svc, mineProviderIds);

  let board: unknown[] = [];
  let myResponses: unknown[] = [];
  if (role === 'model') {
    const { data: presence } = await svc
      .from('provider_presence')
      .select('city')
      .eq('provider_id', user.id)
      .eq('is_available', true);
    const cities = [...new Set((presence ?? []).map((p) => p.city as string))];
    if (cities.length > 0) {
      const { data: openRaw } = await svc
        .from('board_requests')
        .select('*')
        .in('city', cities)
        .eq('status', 'open')
        .neq('client_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      const openRows: BoardRequestRow[] = [];
      for (const row of (openRaw ?? []) as BoardRequestRow[]) {
        const r = await expireIfDue(svc, row);
        if (r.status === 'open') openRows.push(r);
      }
      const boardResponses = await responsesFor(svc, openRows.map((r) => r.id));
      const boardProviders = await providerSummaries(
        svc,
        [...boardResponses.values()].flat().map((r) => r.provider_id).filter((v): v is string => !!v)
      );
      board = await Promise.all(
        openRows.map(async (r) => ({
          ...dto(r, boardResponses.get(r.id) ?? [], boardProviders),
          trust: await clientTrustSummary(svc, r.client_id),
        }))
      );
    }
    const { data: myResp } = await svc
      .from('board_responses')
      .select('*, board_requests:request_id (id, city, service_type, proposed_rate_ngn, timing, status, picked_provider_id, created_at)')
      .eq('provider_id', user.id)
      .eq('author_role', 'provider')
      .order('created_at', { ascending: false })
      .limit(30);
    myResponses = (myResp ?? []).map((r) => {
      const req = (r as { board_requests?: Record<string, unknown> }).board_requests;
      return {
        id: r.id,
        kind: r.kind,
        rate_ngn: r.rate_ngn,
        created_at: r.created_at,
        request: req
          ? {
              id: req.id,
              city: req.city,
              serviceLabel: SERVICE_TYPE_LABELS[req.service_type as ServiceType] ?? req.service_type,
              proposed_rate_ngn: req.proposed_rate_ngn,
              status: req.status,
              pickedYou: req.picked_provider_id === user.id,
            }
          : null,
      };
    });
  }

  return NextResponse.json({
    role,
    canRespond: role === 'model' ? await isVerifiedProvider(svc, user.id) : false,
    mine: mine.map((r) => dto(r, mineResponses.get(r.id) ?? [], mineProviders)),
    board,
    myResponses,
  });
}

/**
 * POST /api/board/requests
 * Create a request (unpaid). The fee is paid next through
 * /api/board/requests/[id]/pay; only then does the request open.
 * Body: { city, service_type, proposed_rate_ngn, timing }
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    city?: string;
    service_type?: string;
    proposed_rate_ngn?: number;
    timing?: string;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  if (!(NIGERIA_CITIES as readonly string[]).includes(body.city ?? '')) {
    return NextResponse.json({ error: 'Pick a city from the list' }, { status: 400 });
  }
  if (!isServiceType(body.service_type ?? '')) {
    return NextResponse.json({ error: 'Unknown service type' }, { status: 400 });
  }
  if (!isValidBoardRate(body.proposed_rate_ngn)) {
    return NextResponse.json(
      { error: 'Your offer must be a whole amount between ₦5,000 and ₦10,000,000' },
      { status: 400 }
    );
  }
  if (!isBoardTiming(body.timing)) {
    return NextResponse.json({ error: 'Pick when you want to meet' }, { status: 400 });
  }

  const svc = service();
  const { data: live } = await svc
    .from('board_requests')
    .select('*')
    .eq('client_id', user.id)
    .in('status', ['awaiting_payment', 'open'])
    .maybeSingle();
  if (live) {
    const settled = await settleOpenIfPaid(svc, live as unknown as BoardRequestRow);
    const expired = await expireIfDue(svc, settled);
    if (expired.status === 'awaiting_payment' || expired.status === 'open') {
      return NextResponse.json(
        { error: 'You already have a live request. Let it finish or cancel it first.' },
        { status: 409 }
      );
    }
  }

  const { data: inserted, error } = await svc
    .from('board_requests')
    .insert({
      client_id: user.id,
      city: body.city,
      service_type: body.service_type,
      proposed_rate_ngn: body.proposed_rate_ngn,
      timing: body.timing,
      status: 'awaiting_payment',
    })
    .select('*')
    .single();
  if (error || !inserted) {
    return NextResponse.json({ error: 'Could not create your request' }, { status: 500 });
  }
  return NextResponse.json({ request: dto(inserted as BoardRequestRow, [], new Map()) });
}
