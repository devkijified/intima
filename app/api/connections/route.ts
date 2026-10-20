import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  evaluateEligibility,
  hasRequirements,
  type CompanionRequirements,
} from '@/lib/connections/eligibility';
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requirementsFor(
  svc: ReturnType<typeof service>,
  providerId: string
): Promise<CompanionRequirements | null> {
  const { data } = await svc
    .from('profiles')
    .select('req_verified_client, req_min_connections, req_min_account_days')
    .eq('id', providerId)
    .maybeSingle();
  if (!data) return null;
  return {
    req_verified_client: data.req_verified_client === true,
    req_min_connections: data.req_min_connections ?? 0,
    req_min_account_days: data.req_min_account_days ?? 0,
  };
}

/** The companion's screening questions (up to 3 short strings). */
async function intakeQuestionsFor(
  svc: ReturnType<typeof service>,
  providerId: string
): Promise<string[]> {
  const { data } = await svc
    .from('profiles')
    .select('intake_questions')
    .eq('id', providerId)
    .maybeSingle();
  const raw = (data as { intake_questions?: unknown } | null)?.intake_questions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is string => typeof q === 'string')
    .map((q) => q.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 3);
}

interface IntakeAnswer {
  q: string;
  a: string;
}

/**
 * Validate the shape of client-supplied intake answers. Returns the
 * normalized answers, or an error message. Answers are user text, so
 * every answer passes the contact leak scanner here: no phone numbers
 * or off-platform routes ride in on a screening answer.
 */
function normalizeIntakeAnswers(
  raw: unknown
): { answers: IntakeAnswer[] | null; error: string | null } {
  if (raw === undefined || raw === null) return { answers: null, error: null };
  if (!Array.isArray(raw)) {
    return { answers: null, error: 'intakeAnswers must be an array' };
  }
  if (raw.length > 3) {
    return { answers: null, error: 'Answer at most 3 questions' };
  }
  const answers: IntakeAnswer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { answers: null, error: 'Each answer needs a question and an answer' };
    }
    const q = (item as { q?: unknown }).q;
    const a = (item as { a?: unknown }).a;
    if (typeof q !== 'string' || typeof a !== 'string') {
      return { answers: null, error: 'Each answer needs a question and an answer' };
    }
    const answer = a.trim().slice(0, 300);
    if (!answer) {
      return { answers: null, error: 'Please answer every question' };
    }
    const scan = scanForLeaks(answer);
    if (!scan.clean) {
      return { answers: null, error: leakWarning(scan.leaks) };
    }
    answers.push({ q: q.trim().slice(0, 120), a: answer });
  }
  return { answers, error: null };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Referral reward on a genuinely new first connection. Best effort by
 * design: any failure is logged and swallowed so booking never breaks.
 * The referral_rewards row is inserted BEFORE crediting (its unique
 * index on referee_id is the double-pay guard); if the credit fails,
 * the row stays and an admin can reconcile.
 *
 * Amounts: a client referrer earns 100 coins. A companion referrer
 * was specced for one free boost credit, but boosts have no credit
 * concept (migration 027 only records paid placements), so she gets
 * 500 coins labeled referral instead. Both go through credit_coins
 * (migration 036) when that function exists.
 */
async function maybeGrantReferralReward(
  svc: ReturnType<typeof service>,
  clientId: string,
  connectionId: string
): Promise<void> {
  try {
    const { data: clientProfile } = await svc
      .from('profiles')
      .select('referred_by')
      .eq('id', clientId)
      .maybeSingle();
    const referredBy = (clientProfile as { referred_by?: string | null } | null)
      ?.referred_by?.trim();
    if (!referredBy) return;

    // referred_by stores a username from the share link (see migration
    // 043); accept a raw profile uuid too.
    let referrer: { id: string; role: string | null } | null = null;
    if (UUID_RE.test(referredBy)) {
      const { data } = await svc
        .from('profiles')
        .select('id, role')
        .eq('id', referredBy)
        .maybeSingle();
      referrer = data;
    } else {
      const { data } = await svc
        .from('profiles')
        .select('id, role')
        .eq('username', referredBy.toLowerCase())
        .maybeSingle();
      referrer = data;
    }
    if (!referrer || referrer.id === clientId) return;

    const { data: existingReward } = await svc
      .from('referral_rewards')
      .select('id')
      .eq('referee_id', clientId)
      .maybeSingle();
    if (existingReward) return;

    const coins = referrer.role === 'model' ? 500 : 100;

    const { error: rewardErr } = await svc.from('referral_rewards').insert({
      referrer_id: referrer.id,
      referee_id: clientId,
      reward_kind: 'coins',
      coins,
      connection_id: connectionId,
    });
    if (rewardErr) {
      // Unique violation means a concurrent request already granted it.
      console.error('referral reward insert failed', rewardErr.message);
      return;
    }

    try {
      const { error: creditErr } = await svc.rpc('credit_coins', {
        p_user_id: referrer.id,
        p_amount: coins,
        p_kind: 'referral',
        p_ref: `referral-${clientId}`,
        p_meta: { referee_id: clientId, connection_id: connectionId },
      });
      if (creditErr) {
        console.error('referral credit_coins failed', creditErr.message);
      }
    } catch (e) {
      console.error('referral credit_coins failed', e);
    }
  } catch (e) {
    console.error('referral reward failed', e);
  }
}

/**
 * GET /api/connections?provider_id=...
 * Pre-check shown before payment: does this client meet the companion's
 * requirements (Bybit counterparty conditions)? Returns the checks.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const providerId = req.nextUrl.searchParams.get('provider_id');
  if (!providerId) {
    return NextResponse.json({ error: 'provider_id is required' }, { status: 400 });
  }

  const svc = service();
  const reqs = await requirementsFor(svc, providerId);
  if (!reqs) return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
  if (!hasRequirements(reqs)) {
    return NextResponse.json({ eligible: true, checks: [] });
  }
  const result = await evaluateEligibility(svc, user.id, user.created_at ?? null, reqs);
  return NextResponse.json(result);
}

/**
 * POST /api/connections
 * The authoritative create. The fee comes from platform_settings on
 * the server, eligibility is re-checked here (never trusted from the
 * client), and the row is inserted with the service role.
 * Body: { provider_id, payment_ref, proposed_rate_ngn?, intakeAnswers? }
 * intakeAnswers are the client's answers to the companion's screening
 * questions: shape-checked and leak-scanned here before storage.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    provider_id?: string;
    payment_ref?: string;
    proposed_rate_ngn?: number | null;
    intakeAnswers?: unknown;
  } | null;
  if (!body?.provider_id || !body?.payment_ref) {
    return NextResponse.json(
      { error: 'provider_id and payment_ref are required' },
      { status: 400 }
    );
  }
  if (body.provider_id === user.id) {
    return NextResponse.json(
      { error: 'You cannot connect with yourself' },
      { status: 400 }
    );
  }

  // Intake answers: validate shape and scan for contact leaks first,
  // so a dirty answer is blocked even before eligibility runs.
  const intake = normalizeIntakeAnswers(body.intakeAnswers);
  if (intake.error) {
    return NextResponse.json({ error: intake.error }, { status: 400 });
  }

  const svc = service();

  const reqs = await requirementsFor(svc, body.provider_id);
  if (!reqs) return NextResponse.json({ error: 'Companion not found' }, { status: 404 });

  if (hasRequirements(reqs)) {
    const result = await evaluateEligibility(svc, user.id, user.created_at ?? null, reqs);
    if (!result.eligible) {
      return NextResponse.json(
        {
          error: 'You do not meet this companion’s requirements yet.',
          checks: result.checks,
        },
        { status: 403 }
      );
    }
  }

  const { data: setting } = await svc
    .from('platform_settings')
    .select('value')
    .eq('key', 'connection_fee_ngn')
    .maybeSingle();
  const fee = Number(setting?.value ?? 5000);

  const { data: existing } = await svc
    .from('connections')
    .select('id')
    .eq('client_id', user.id)
    .eq('provider_id', body.provider_id)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ success: true, alreadyConnected: true, id: existing.id });
  }

  // If she asks screening questions, answers are required to connect.
  const questions = await intakeQuestionsFor(svc, body.provider_id);
  let intakeAnswers: IntakeAnswer[] | null = null;
  if (questions.length > 0) {
    if (!intake.answers || intake.answers.length < questions.length) {
      return NextResponse.json(
        { error: 'Please answer her screening questions first' },
        { status: 400 }
      );
    }
    // Store the companion's own question text, not the client echo.
    intakeAnswers = questions.map((q, i) => ({ q, a: intake.answers![i].a }));
  } else if (intake.answers && intake.answers.length > 0) {
    intakeAnswers = intake.answers;
  }

  const now = new Date();
  const { data: inserted, error } = await svc
    .from('connections')
    .insert({
      client_id: user.id,
      provider_id: body.provider_id,
      fee_ngn: fee,
      status: 'active',
      // The fee sits in its 24 hour protection window from the moment
      // the connection activates; either side can dispute it in chat.
      fee_state: 'held',
      paid_at: now.toISOString(),
      dispute_deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      payment_ref: body.payment_ref,
      proposed_rate_ngn:
        typeof body.proposed_rate_ngn === 'number' && body.proposed_rate_ngn > 0
          ? body.proposed_rate_ngn
          : null,
      intake_answers: intakeAnswers,
    })
    .select('id')
    .single();
  if (error) {
    return NextResponse.json({ error: 'Could not create the connection' }, { status: 500 });
  }

  // Genuinely new connection: the only path that can pay a referral.
  await maybeGrantReferralReward(svc, user.id, inserted.id);

  return NextResponse.json({ success: true, id: inserted.id });
}
