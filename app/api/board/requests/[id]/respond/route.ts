import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notifyUsers } from '@/lib/push-server';
import {
  isVerifiedProvider,
  isValidBoardRate,
  settleOpenIfPaid,
  expireIfDue,
  fillRequest,
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
 * POST /api/board/requests/[id]/respond
 * A verified companion responds to an open request:
 *   { kind: 'accept' }                  take the client's offer
 *   { kind: 'counter', rate_ngn }       one numeric counter
 *   { action: 'accept_counter', response_id }
 *                                       take the client's counter,
 *                                       which fills the request now
 * Caps keep the negotiation bounded (the research rules): at most
 * two provider responses per request, and an accept is final.
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
    kind?: string;
    rate_ngn?: number;
    action?: string;
    response_id?: string;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const svc = service();
  const { data: requestRaw } = await svc
    .from('board_requests')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (!requestRaw) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  let request = await settleOpenIfPaid(svc, requestRaw as BoardRequestRow);
  request = await expireIfDue(svc, request);
  if (request.status !== 'open') {
    return NextResponse.json({ error: 'This request is no longer open.' }, { status: 409 });
  }
  if (request.client_id === user.id) {
    return NextResponse.json(
      { error: 'You cannot respond to your own request' },
      { status: 400 }
    );
  }
  if (!(await isVerifiedProvider(svc, user.id))) {
    return NextResponse.json(
      {
        error:
          'Only verified companions can respond to board requests. Finish your ID verification first.',
      },
      { status: 403 }
    );
  }

  // Accepting the client's counter fills the request immediately,
  // unless the companion asks screening questions: those are the
  // client's to answer, so the acceptance becomes a pickable
  // response at the countered rate and the client finishes the
  // connection from their side, answers in hand.
  if (body.action === 'accept_counter') {
    if (!body.response_id) {
      return NextResponse.json({ error: 'response_id is required' }, { status: 400 });
    }
    const { data: counter } = await svc
      .from('board_responses')
      .select('*')
      .eq('id', body.response_id)
      .eq('request_id', request.id)
      .eq('kind', 'client_counter')
      .eq('provider_id', user.id)
      .maybeSingle();
    if (!counter || typeof counter.rate_ngn !== 'number') {
      return NextResponse.json({ error: 'Counter-offer not found' }, { status: 404 });
    }
    const { data: myProfile } = await svc
      .from('profiles')
      .select('intake_questions')
      .eq('id', user.id)
      .maybeSingle();
    const myQuestions = (myProfile as { intake_questions?: unknown } | null)?.intake_questions;
    if (Array.isArray(myQuestions) && myQuestions.filter((q) => typeof q === 'string' && q.trim()).length > 0) {
      const { data: existingAccept } = await svc
        .from('board_responses')
        .select('id')
        .eq('request_id', request.id)
        .eq('provider_id', user.id)
        .eq('kind', 'accept')
        .maybeSingle();
      if (!existingAccept) {
        await svc.from('board_responses').insert({
          request_id: request.id,
          provider_id: user.id,
          author_role: 'provider',
          kind: 'accept',
          rate_ngn: counter.rate_ngn,
        });
      }
      await notifyUsers({
        userIds: [request.client_id],
        type: 'board_response',
        title: 'A companion accepted your counter',
        body: `A companion accepted your ${formatCompactPrice(counter.rate_ngn)} counter. Open the board to connect.`,
        link: '/board',
      }).catch(() => {});
      return NextResponse.json({ success: true, filled: false, needsClientPick: true });
    }
    const result = await fillRequest(svc, {
      request,
      providerId: user.id,
      agreedRate: counter.rate_ngn,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, needsIntake: result.needsIntake, questions: result.questions },
        { status: result.status }
      );
    }
    return NextResponse.json({ success: true, filled: true, connectionId: result.connectionId });
  }

  if (body.kind !== 'accept' && body.kind !== 'counter') {
    return NextResponse.json({ error: 'kind must be "accept" or "counter"' }, { status: 400 });
  }
  if (body.kind === 'counter' && !isValidBoardRate(body.rate_ngn)) {
    return NextResponse.json(
      { error: 'Your counter must be a whole amount between ₦5,000 and ₦10,000,000' },
      { status: 400 }
    );
  }

  const { data: existing } = await svc
    .from('board_responses')
    .select('id, kind')
    .eq('request_id', request.id)
    .eq('provider_id', user.id)
    .eq('author_role', 'provider');
  const rows = existing ?? [];
  if (rows.some((r) => r.kind === 'accept')) {
    return NextResponse.json({ error: 'You already accepted this request.' }, { status: 409 });
  }
  if (rows.length >= 2) {
    return NextResponse.json(
      { error: 'You have used your two responses on this request.' },
      { status: 409 }
    );
  }

  const { data: inserted, error } = await svc
    .from('board_responses')
    .insert({
      request_id: request.id,
      provider_id: user.id,
      author_role: 'provider',
      kind: body.kind,
      rate_ngn: body.kind === 'counter' ? body.rate_ngn : null,
    })
    .select('*')
    .single();
  if (error || !inserted) {
    return NextResponse.json({ error: 'Could not send your response' }, { status: 500 });
  }

  await notifyUsers({
    userIds: [request.client_id],
    type: 'board_response',
    title: 'A companion responded to your request',
    body:
      body.kind === 'accept'
        ? `A companion accepted your ${formatCompactPrice(request.proposed_rate_ngn)} offer. Open the board to connect.`
        : `A companion countered at ${formatCompactPrice(body.rate_ngn as number)}. Open the board to decide.`,
    link: '/board',
  }).catch(() => {});

  return NextResponse.json({ success: true, response: inserted });
}
