import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notifyUsers } from '@/lib/push-server';
import {
  isValidBoardRate,
  settleOpenIfPaid,
  expireIfDue,
  type BoardRequestRow,
} from '@/lib/board/board';
import { formatCompactPrice } from '@/lib/utils/helpers';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/board/requests/[id]/counter
 * The client's one counter-offer back to a companion who countered.
 * Numbers only, no messages: the negotiation stays structured.
 * Body: { response_id, rate_ngn }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    response_id?: string;
    rate_ngn?: number;
  } | null;
  if (!body?.response_id || !isValidBoardRate(body.rate_ngn)) {
    return NextResponse.json(
      { error: 'Pick the counter you are answering and give a whole amount between ₦5,000 and ₦10,000,000' },
      { status: 400 }
    );
  }

  const svc = service();
  const { data: requestRaw } = await svc
    .from('board_requests')
    .select('*')
    .eq('id', params.id)
    .eq('client_id', user.id)
    .maybeSingle();
  if (!requestRaw) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  let request = await settleOpenIfPaid(svc, requestRaw as BoardRequestRow);
  request = await expireIfDue(svc, request);
  if (request.status !== 'open') {
    return NextResponse.json({ error: 'This request is no longer open.' }, { status: 409 });
  }

  const { data: target } = await svc
    .from('board_responses')
    .select('*')
    .eq('id', body.response_id)
    .eq('request_id', request.id)
    .eq('author_role', 'provider')
    .eq('kind', 'counter')
    .maybeSingle();
  if (!target?.provider_id) {
    return NextResponse.json({ error: 'That counter is no longer available.' }, { status: 404 });
  }

  const { data: existingCounter } = await svc
    .from('board_responses')
    .select('id')
    .eq('request_id', request.id)
    .eq('provider_id', target.provider_id)
    .eq('kind', 'client_counter')
    .maybeSingle();
  if (existingCounter) {
    return NextResponse.json(
      { error: 'You already countered this companion. She can accept it or let it stand.' },
      { status: 409 }
    );
  }

  const { data: inserted, error } = await svc
    .from('board_responses')
    .insert({
      request_id: request.id,
      provider_id: target.provider_id,
      author_role: 'client',
      kind: 'client_counter',
      rate_ngn: body.rate_ngn,
    })
    .select('*')
    .single();
  if (error || !inserted) {
    return NextResponse.json({ error: 'Could not send your counter' }, { status: 500 });
  }

  await notifyUsers({
    userIds: [target.provider_id],
    type: 'board_response',
    title: 'The client countered your offer',
    body: `The client came back at ${formatCompactPrice(body.rate_ngn)}. Open the board to accept it or let it stand.`,
    link: '/board',
  }).catch(() => {});

  return NextResponse.json({ success: true, response: inserted });
}
