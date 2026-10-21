import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  settleOpenIfPaid,
  expireIfDue,
  fillRequest,
  type BoardRequestRow,
} from '@/lib/board/board';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/board/requests/[id]/pick
 * The client picks a companion's response and the request fills:
 * an accept connects at the client's offered rate, accepting a
 * counter connects at her counter rate. If the companion asks
 * screening questions, the answerer rides along here
 * (intakeAnswers) or the response says what is missing.
 * Body: { response_id, intakeAnswers? }
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
    intakeAnswers?: unknown;
  } | null;
  if (!body?.response_id) {
    return NextResponse.json({ error: 'response_id is required' }, { status: 400 });
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

  const { data: response } = await svc
    .from('board_responses')
    .select('*')
    .eq('id', body.response_id)
    .eq('request_id', request.id)
    .eq('author_role', 'provider')
    .maybeSingle();
  if (!response || !response.provider_id) {
    return NextResponse.json({ error: 'Response not found' }, { status: 404 });
  }
  // An accept normally connects at the client's offered rate; an
  // accept converted from the client's counter carries that rate
  // on the response itself and wins.
  const agreedRate =
    typeof response.rate_ngn === 'number'
      ? response.rate_ngn
      : response.kind === 'accept'
        ? request.proposed_rate_ngn
        : null;
  if (agreedRate === null) {
    return NextResponse.json({ error: 'That response cannot be picked.' }, { status: 400 });
  }

  const result = await fillRequest(svc, {
    request,
    providerId: response.provider_id,
    agreedRate,
    intakeRaw: body.intakeAnswers,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, needsIntake: result.needsIntake, questions: result.questions },
      { status: result.status }
    );
  }
  return NextResponse.json({ success: true, connectionId: result.connectionId });
}
