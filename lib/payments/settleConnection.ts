import type { SupabaseClient } from '@supabase/supabase-js';
import {
  evaluateEligibility,
  hasRequirements,
  type CompanionRequirements,
} from '@/lib/connections/eligibility';
import { isServiceType } from '@/lib/connections/serviceType';
import { notifyUsers } from '@/lib/push-server';

/**
 * Webhook-side completion of a connection fee.
 *
 * The gateways settle the payment row in the background (Paystack
 * flips card_payments to paid, NOWPayments flips crypto_payments to
 * finished), but the connection itself was only created when the
 * payer's browser came back and called POST /api/connections. A
 * payer who closed the tab, lost signal, or never got redirected
 * had paid for a connection that did not exist until they happened
 * to revisit the callback link.
 *
 * This settler finishes the job from the webhook alone. It runs
 * the same steps POST /api/connections runs, from data stored on
 * the payment row at initialize time: the companion target, the
 * screening answers (card rail; already shape-checked and
 * leak-scanned at initialize), and the service pick. Eligibility
 * is re-checked here, never assumed. The reference stays
 * single-use: a connection already carrying it ends the call.
 *
 * One honest gap: the proposed rate lives only in the payer's
 * browser during the interactive flow, so a webhook-settled
 * connection opens without it and the client restates it in chat.
 * The fee, the answers, and the connection itself all survive.
 *
 * Idempotent by construction and safe on duplicate webhooks: any
 * state that means "already handled" returns 'already' or a
 * 'skipped' reason instead of creating anything twice. Failures
 * are swallowed into the outcome so a settler hiccup can never
 * fail the webhook response itself.
 */

export interface IntakeAnswer {
  q: string;
  a: string;
}

export async function requirementsFor(
  svc: SupabaseClient,
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
export async function intakeQuestionsFor(
  svc: SupabaseClient,
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
export async function maybeGrantReferralReward(
  svc: SupabaseClient,
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
      } else {
        await notifyUsers({
          userIds: [referrer.id],
          type: 'referral_reward',
          title: 'Referral reward',
          body: `You earned ${coins} coins because someone you referred made their first connection. The coins are in your wallet.`,
          link: '/wallet',
        }).catch(() => {});
      }
    } catch (e) {
      console.error('referral credit_coins failed', e);
    }
  } catch (e) {
    console.error('referral reward failed', e);
  }
}

/** Defensive read of the answers stored on a payment row. */
function storedAnswers(raw: unknown): IntakeAnswer[] | null {
  if (!Array.isArray(raw)) return null;
  const out: IntakeAnswer[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as { q?: unknown }).q === 'string' &&
      typeof (item as { a?: unknown }).a === 'string'
    ) {
      const a = ((item as { a: string }).a ?? '').trim().slice(0, 300);
      if (a) {
        out.push({ q: ((item as { q: string }).q ?? '').trim().slice(0, 120), a });
      }
    }
  }
  return out.length > 0 ? out : null;
}

export type ConnectionSettleOutcome =
  | { outcome: 'created'; connectionId: string }
  | { outcome: 'already' }
  | { outcome: 'skipped'; reason: string };

export async function settleConnectionFeePayment(
  svc: SupabaseClient,
  rail: 'card' | 'crypto',
  reference: string
): Promise<ConnectionSettleOutcome> {
  try {
    return await settle(svc, rail, reference);
  } catch (e) {
    console.error('settleConnectionFeePayment failed', rail, reference, e);
    return { outcome: 'skipped', reason: 'error' };
  }
}

async function settle(
  svc: SupabaseClient,
  rail: 'card' | 'crypto',
  reference: string
): Promise<ConnectionSettleOutcome> {
  // Load the settled payment row. Everything the connection needs
  // was stored on it at initialize time (the crypto create stores
  // no answers or service pick, so those read as null there).
  let userId: string | null = null;
  let providerId: string | null = null;
  let amountNgn = 0;
  let answersRaw: unknown = null;
  let serviceRaw: string | null = null;

  if (rail === 'card') {
    const { data: row } = await svc
      .from('card_payments')
      .select(
        'user_id, kind, status, amount_ngn, target_provider_id, intake_answers, service_type, board_request_id'
      )
      .eq('reference', reference)
      .maybeSingle();
    if (!row) return { outcome: 'skipped', reason: 'no_payment_row' };
    if (row.kind !== 'connection_fee') return { outcome: 'skipped', reason: 'not_a_fee' };
    if (row.board_request_id) return { outcome: 'skipped', reason: 'board_request' };
    if (row.status !== 'paid') return { outcome: 'skipped', reason: 'not_settled' };
    userId = row.user_id as string;
    providerId = row.target_provider_id as string | null;
    amountNgn = Number(row.amount_ngn ?? 0);
    answersRaw = row.intake_answers;
    serviceRaw = (row.service_type as string | null) ?? null;
  } else {
    const { data: row } = await svc
      .from('crypto_payments')
      .select('user_id, kind, status, amount_ngn, target_provider_id')
      .eq('reference', reference)
      .maybeSingle();
    if (!row) return { outcome: 'skipped', reason: 'no_payment_row' };
    if (row.kind !== 'connection_fee') return { outcome: 'skipped', reason: 'not_a_fee' };
    if (row.status !== 'finished') return { outcome: 'skipped', reason: 'not_settled' };
    userId = row.user_id as string;
    providerId = row.target_provider_id as string | null;
    amountNgn = Number(row.amount_ngn ?? 0);
  }

  if (!userId || !providerId) return { outcome: 'skipped', reason: 'missing_parties' };
  if (userId === providerId) return { outcome: 'skipped', reason: 'self_connection' };

  // Single use: this reference may already have opened the
  // connection through the normal browser flow (or an earlier
  // webhook delivery). Either way the job is done.
  const { data: used } = await svc
    .from('connections')
    .select('id')
    .eq('payment_ref', reference)
    .maybeSingle();
  if (used) return { outcome: 'already' };

  const { data: existing } = await svc
    .from('connections')
    .select('id')
    .eq('client_id', userId)
    .eq('provider_id', providerId)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) return { outcome: 'already' };

  // The fee is read from platform_settings, exactly like the
  // interactive flow, and the settled amount must match it.
  const { data: setting } = await svc
    .from('platform_settings')
    .select('value')
    .eq('key', 'connection_fee_ngn')
    .maybeSingle();
  const fee = Number(setting?.value ?? 5000);
  if (amountNgn !== fee) return { outcome: 'skipped', reason: 'amount_mismatch' };

  // Eligibility is re-checked, never assumed from the payment: her
  // requirements bind a webhook-created connection exactly as they
  // bind the interactive one.
  const reqs = await requirementsFor(svc, providerId);
  if (!reqs) return { outcome: 'skipped', reason: 'companion_not_found' };
  if (hasRequirements(reqs)) {
    let createdAt: string | null = null;
    try {
      const { data } = await svc.auth.admin.getUserById(userId);
      createdAt = data?.user?.created_at ?? null;
    } catch {
      createdAt = null;
    }
    const result = await evaluateEligibility(svc, userId, createdAt, reqs);
    if (!result.eligible) return { outcome: 'skipped', reason: 'not_eligible' };
  }

  // Screening answers: if she asks questions, stored answers are
  // required and are re-mapped onto her current question text,
  // exactly like the interactive flow. Without stored answers
  // (the crypto rail stores none) the connection cannot be
  // completed here and the browser flow remains the path.
  const questions = await intakeQuestionsFor(svc, providerId);
  const stored = storedAnswers(answersRaw);
  let intakeAnswers: IntakeAnswer[] | null = null;
  if (questions.length > 0) {
    if (!stored || stored.length < questions.length) {
      return { outcome: 'skipped', reason: 'answers_missing' };
    }
    intakeAnswers = questions.map((q, i) => ({ q, a: stored[i].a }));
  } else if (stored && stored.length > 0) {
    intakeAnswers = stored;
  }

  const serviceType =
    serviceRaw !== null && isServiceType(serviceRaw) ? serviceRaw : null;

  const now = new Date();
  const { data: inserted, error } = await svc
    .from('connections')
    .insert({
      client_id: userId,
      provider_id: providerId,
      fee_ngn: fee,
      status: 'active',
      // The fee sits in its 24 hour protection window from the moment
      // the connection activates; either side can dispute it in chat.
      fee_state: 'held',
      paid_at: now.toISOString(),
      dispute_deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      payment_ref: reference,
      // The proposed rate lives only in the payer's browser during
      // the interactive flow; a webhook-settled connection opens
      // without it and the client restates it in chat.
      proposed_rate_ngn: null,
      service_type: serviceType,
      intake_answers: intakeAnswers,
    })
    .select('id')
    .single();
  if (error || !inserted) {
    console.error('webhook connection insert failed', reference, error?.message);
    return { outcome: 'skipped', reason: 'insert_failed' };
  }

  // Genuinely new connection: the only path that can pay a referral.
  await maybeGrantReferralReward(svc, userId, inserted.id);

  // Tell the companion right away (bell row plus push, best effort).
  await notifyUsers({
    userIds: [providerId],
    type: 'new_connection',
    title: 'New connection',
    body: 'A client just connected with you. Say hello in Messages.',
    link: '/bookings',
  }).catch(() => {});

  return { outcome: 'created', connectionId: inserted.id };
}
