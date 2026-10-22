import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyUsers } from '@/lib/push-server';
import {
  evaluateEligibility,
  hasRequirements,
  type CompanionRequirements,
} from '@/lib/connections/eligibility';
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck';
import {
  refundTransaction,
  refundAmountNgn,
  getRefundPct,
  listRefundsForTransaction,
  refundStateForGatewayStatus,
} from '@/lib/payments/paystack';
import { maybeGrantReferralReward } from '@/lib/payments/settleConnection';
import { SERVICE_TYPE_LABELS, type ServiceType } from '@/lib/connections/serviceType';
import { formatCompactPrice } from '@/lib/utils/helpers';

/**
 * The request board (migration 062).
 *
 * A client posts a structured request and pays the standard
 * connection fee up front. The request carries tokens only (city,
 * service, timing, a numeric rate): there is no free text anywhere
 * on the board, so there is nothing for contact details to leak
 * through, and the client stays anonymous until the pick.
 *
 * Verified companions in the city respond with Accept or a numeric
 * counter (never first-to-accept: the client picks). The pick
 * stamps the settled fee payment to the chosen companion and opens
 * a normal connection with the agreed rate recorded. A request
 * that expires unfilled refunds the fee through the original rail.
 */

import { BOARD_OPEN_HOURS } from './shared';

export {
  BOARD_TIMINGS,
  BOARD_TIMING_LABELS,
  BOARD_OPEN_HOURS,
  BOARD_MIN_RATE,
  BOARD_MAX_RATE,
  isBoardTiming,
  isValidBoardRate,
  type BoardTiming,
} from './shared';

export interface BoardRequestRow {
  id: string;
  client_id: string;
  city: string;
  service_type: string;
  proposed_rate_ngn: number;
  timing: string;
  status: string;
  payment_ref: string | null;
  payment_rail: string | null;
  picked_provider_id: string | null;
  connection_id: string | null;
  refund_state: string | null;
  opened_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export async function boardFeeNgn(svc: SupabaseClient): Promise<number> {
  const { data } = await svc
    .from('platform_settings')
    .select('value')
    .eq('key', 'connection_fee_ngn')
    .maybeSingle();
  return Number(data?.value ?? 5000);
}

/** The anonymised trust signals a provider sees on a request. */
export async function clientTrustSummary(
  svc: SupabaseClient,
  clientId: string
): Promise<{ connections: number; memberSince: string | null }> {
  const { count } = await svc
    .from('connections')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId);
  const { data } = await svc
    .from('profiles')
    .select('created_at')
    .eq('id', clientId)
    .maybeSingle();
  return {
    connections: count ?? 0,
    memberSince: (data as { created_at?: string } | null)?.created_at ?? null,
  };
}

/** Verified, visible companions are the only ones who may respond. */
export async function isVerifiedProvider(
  svc: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await svc
    .from('profiles')
    .select('role, is_verified, verification_status, is_hidden')
    .eq('id', userId)
    .maybeSingle();
  if (!data || data.role !== 'model' || data.is_hidden) return false;
  return data.is_verified === true || data.verification_status === 'verified';
}

/** Available companions in a city (presence based), for fanout. */
export async function providerIdsInCity(
  svc: SupabaseClient,
  city: string
): Promise<string[]> {
  const { data: presence } = await svc
    .from('provider_presence')
    .select('provider_id')
    .eq('city', city)
    .eq('is_available', true)
    .limit(200);
  const ids = (presence ?? [])
    .map((r) => (r as { provider_id?: string }).provider_id)
    .filter((v): v is string => typeof v === 'string');
  if (ids.length === 0) return [];
  const { data: profiles } = await svc
    .from('profiles')
    .select('id')
    .in('id', ids)
    .eq('role', 'model')
    .eq('is_hidden', false);
  return (profiles ?? []).map((p) => p.id as string);
}

async function settledPaymentFor(
  svc: SupabaseClient,
  request: BoardRequestRow
): Promise<{ rail: 'card' | 'crypto' | 'coins' } | null> {
  if (!request.payment_ref) return null;
  // Coins rail: the reference is a coin_ledger spend. Its row is
  // the settlement proof, written atomically with the balance.
  if (request.payment_ref.startsWith('COINS-')) {
    const { data: led } = await svc
      .from('coin_ledger')
      .select('id')
      .eq('kind', 'board_fee')
      .eq('ref', request.payment_ref)
      .eq('user_id', request.client_id)
      .lt('delta', 0)
      .maybeSingle();
    return led ? { rail: 'coins' } : null;
  }
  const { data: card } = await svc
    .from('card_payments')
    .select('status')
    .eq('reference', request.payment_ref)
    .eq('board_request_id', request.id)
    .eq('user_id', request.client_id)
    .maybeSingle();
  if (card?.status === 'paid') return { rail: 'card' };
  const { data: crypto } = await svc
    .from('crypto_payments')
    .select('status')
    .eq('reference', request.payment_ref)
    .eq('board_request_id', request.id)
    .eq('user_id', request.client_id)
    .maybeSingle();
  if (crypto?.status === 'finished') return { rail: 'crypto' };
  return null;
}

/**
 * Flip an awaiting_payment request to open once its fee settles.
 * Runs lazily from reads and picks as well as from the sweep, so a
 * bank transfer that settles while nobody is looking still opens
 * the request and fans out to the city's companions.
 */
export async function settleOpenIfPaid(
  svc: SupabaseClient,
  request: BoardRequestRow
): Promise<BoardRequestRow> {
  if (request.status !== 'awaiting_payment') return request;
  const settled = await settledPaymentFor(svc, request);
  if (!settled) return request;
  const now = new Date();
  const expires = new Date(now.getTime() + BOARD_OPEN_HOURS * 3600 * 1000);
  const { data: updated } = await svc
    .from('board_requests')
    .update({
      status: 'open',
      payment_rail: settled.rail,
      opened_at: now.toISOString(),
      expires_at: expires.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', request.id)
    .eq('status', 'awaiting_payment')
    .select('*')
    .maybeSingle();
  if (!updated) return request;
  const row = updated as BoardRequestRow;
  const label = SERVICE_TYPE_LABELS[row.service_type as ServiceType] ?? 'a meeting';
  const ids = await providerIdsInCity(svc, row.city);
  if (ids.length > 0) {
    await notifyUsers({
      userIds: ids,
      type: 'board_request_new',
      title: `New request in ${row.city}`,
      body: `A client is looking for ${label.toLowerCase()} and offering ${formatCompactPrice(row.proposed_rate_ngn)}. Open the board to respond.`,
      link: '/board',
    }).catch(() => {});
  }
  return row;
}

/** Attempt the fee refund through the original rail. */
export async function attemptRefund(
  svc: SupabaseClient,
  request: BoardRequestRow
): Promise<string> {
  const { state } = await attemptRefundDetailed(svc, request);
  return state;
}

/**
 * Same refund attempt, but the gateway's refusal reason travels
 * back with the state: a bare "failed" gives an admin nothing to
 * act on, so the admin retry endpoint uses this variant.
 */
export async function attemptRefundDetailed(
  svc: SupabaseClient,
  request: BoardRequestRow
): Promise<{ state: string; error: string | null }> {
  if (!request.payment_ref || request.refund_state === 'refunded') {
    return { state: request.refund_state ?? 'pending', error: null };
  }
  // Coins refunds are instant: the refund_pct share of the fee returns to the
  // wallet it came from. credit_coins is idempotent on its ref, so
  // a retry after a crash can never pay twice.
  if (request.payment_rail === 'coins') {
    const fee = await boardFeeNgn(svc);
    const pct = await getRefundPct(svc);
    const refundCoins = Math.round(Math.ceil(fee / 10) * (pct / 100));
    const { error } = await svc.rpc('credit_coins', {
      p_user_id: request.client_id,
      p_amount: refundCoins,
      p_kind: 'board_fee',
      p_ref: `board-refund-${request.id}`,
      p_meta: { board_request_id: request.id, pct },
    });
    if (error) {
      return { state: 'failed', error: 'The coin refund did not go through' };
    }
    await svc
      .from('board_requests')
      .update({ refund_state: 'refunded', updated_at: new Date().toISOString() })
      .eq('id', request.id);
    return { state: 'refunded', error: null };
  }
  // Crypto refunds are manual through the gateway dashboard.
  if (request.payment_rail !== 'card') {
    await svc
      .from('board_requests')
      .update({ refund_state: 'pending', updated_at: new Date().toISOString() })
      .eq('id', request.id);
    return { state: 'pending', error: null };
  }
  // Board refunds return the refund_pct share of the fee; the platform keeps
  // 15% for processing (see REFUND_PCT in lib/payments/paystack).
  const fee = await boardFeeNgn(svc);
  const paymentRef = request.payment_ref;
  // Adopt a refund that already exists at the gateway before
  // creating another: expiry, the cron sweep and an admin retry
  // can all reach this code for the same request, and Paystack
  // refuses a second refund once the total would pass the
  // original charge. An in-flight refund is a healthy pending,
  // not a failure to retry blindly.
  const existing = await listRefundsForTransaction(paymentRef);
  const live = existing.find((r) => refundStateForGatewayStatus(r.status) !== 'failed');
  if (live) {
    const state = refundStateForGatewayStatus(live.status);
    await svc
      .from('board_requests')
      .update({ refund_state: state, updated_at: new Date().toISOString() })
      .eq('id', request.id);
    return { state, error: null };
  }
  try {
    const result = await refundTransaction(paymentRef, refundAmountNgn(fee, await getRefundPct(svc)) * 100);
    const state =
      result.status === 'success' ? 'refunded' : result.status === 'pending' ? 'pending' : 'failed';
    await svc
      .from('board_requests')
      .update({ refund_state: state, updated_at: new Date().toISOString() })
      .eq('id', request.id);
    return {
      state,
      error: state === 'failed' ? 'Paystack reported the refund as failed' : null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Refund request failed';
    // A refusal saying a refund already covers this charge means
    // one exists after all (a race, or the list read missed it):
    // adopt its state instead of recording a failure.
    if (/exceed/i.test(message)) {
      const again = await listRefundsForTransaction(paymentRef);
      const found = again.find((r) => refundStateForGatewayStatus(r.status) !== 'failed');
      if (found) {
        const state = refundStateForGatewayStatus(found.status);
        await svc
          .from('board_requests')
          .update({ refund_state: state, updated_at: new Date().toISOString() })
          .eq('id', request.id);
        return { state, error: null };
      }
    }
    console.error(`board refund failed for request ${request.id}: ${message}`);
    await svc
      .from('board_requests')
      .update({ refund_state: 'failed', updated_at: new Date().toISOString() })
      .eq('id', request.id);
    return { state: 'failed', error: message };
  }
}

/** Expire an open request whose window has closed, refunding the fee. */
export async function expireIfDue(
  svc: SupabaseClient,
  request: BoardRequestRow
): Promise<BoardRequestRow> {
  if (request.status !== 'open' || !request.expires_at) return request;
  if (new Date(request.expires_at).getTime() > Date.now()) return request;
  const { data: updated } = await svc
    .from('board_requests')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('id', request.id)
    .eq('status', 'open')
    .select('*')
    .maybeSingle();
  if (!updated) return request;
  const row = updated as BoardRequestRow;
  const refund = await attemptRefund(svc, row);
  const fee = await boardFeeNgn(svc);
  const pct = await getRefundPct(svc);
  await notifyUsers({
    userIds: [row.client_id],
    type: 'board_expired',
    title: 'Your request expired',
    body:
      refund === 'refunded'
        ? `No companion picked up your request in time. ${pct}% of your connection fee (₦${refundAmountNgn(fee, pct).toLocaleString('en-NG')}) has been refunded.`
        : `No companion picked up your request in time. Your refund of ${pct}% of the connection fee (₦${refundAmountNgn(fee, pct).toLocaleString('en-NG')}) is being processed.`,
    link: '/board',
  }).catch(() => {});
  return { ...row, refund_state: refund };
}

export interface IntakeAnswer {
  q: string;
  a: string;
}

/**
 * Validate client answers to the picked companion's screening
 * questions: same shape and leak scan as the direct booking path.
 */
export function normalizeBoardIntake(
  raw: unknown,
  questions: string[]
): { answers: IntakeAnswer[] | null; error: string | null } {
  if (questions.length === 0) return { answers: null, error: null };
  if (!Array.isArray(raw) || raw.length < questions.length) {
    return { answers: null, error: 'Please answer her screening questions first' };
  }
  const answers: IntakeAnswer[] = [];
  for (let i = 0; i < questions.length; i++) {
    const item = raw[i] as { a?: unknown } | null;
    const a = typeof item?.a === 'string' ? item.a.trim().slice(0, 300) : '';
    if (!a) return { answers: null, error: 'Please answer every question' };
    const scan = scanForLeaks(a);
    if (!scan.clean) return { answers: null, error: leakWarning(scan.leaks) };
    answers.push({ q: questions[i], a });
  }
  return { answers, error: null };
}

export type FillResult =
  | { ok: true; connectionId: string }
  | {
      ok: false;
      status: number;
      error: string;
      needsIntake?: boolean;
      questions?: string[];
    };

/**
 * Fill a request with a chosen companion at an agreed rate: stamp
 * the settled fee payment to her, then open a normal connection.
 * Shared by the client's pick and a provider accepting the
 * client's counter-offer.
 */
export async function fillRequest(
  svc: SupabaseClient,
  input: {
    request: BoardRequestRow;
    providerId: string;
    agreedRate: number;
    intakeRaw?: unknown;
  }
): Promise<FillResult> {
  const { request, providerId, agreedRate } = input;
  if (request.status !== 'open') {
    return { ok: false, status: 409, error: 'This request is no longer open.' };
  }
  if (providerId === request.client_id) {
    return { ok: false, status: 400, error: 'You cannot connect with yourself' };
  }

  const { data: provider } = await svc
    .from('profiles')
    .select(
      'display_name, req_verified_client, req_min_connections, req_min_account_days, intake_questions'
    )
    .eq('id', providerId)
    .maybeSingle();
  if (!provider) return { ok: false, status: 404, error: 'Companion not found' };

  const reqs: CompanionRequirements = {
    req_verified_client: provider.req_verified_client === true,
    req_min_connections: provider.req_min_connections ?? 0,
    req_min_account_days: provider.req_min_account_days ?? 0,
  };
  if (hasRequirements(reqs)) {
    const { data: clientProfile } = await svc
      .from('profiles')
      .select('created_at')
      .eq('id', request.client_id)
      .maybeSingle();
    const result = await evaluateEligibility(
      svc,
      request.client_id,
      (clientProfile as { created_at?: string } | null)?.created_at ?? null,
      reqs
    );
    if (!result.eligible) {
      return {
        ok: false,
        status: 403,
        error: 'You do not meet this companion’s requirements yet.',
      };
    }
  }

  const rawQ = (provider as { intake_questions?: unknown }).intake_questions;
  const questions: string[] = Array.isArray(rawQ)
    ? rawQ
        .filter((q): q is string => typeof q === 'string')
        .map((q) => q.trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 3)
    : [];
  const intake = normalizeBoardIntake(input.intakeRaw, questions);
  if (intake.error) {
    return {
      ok: false,
      status: 400,
      error: intake.error,
      needsIntake: true,
      questions,
    };
  }

  const settled = await settledPaymentFor(svc, request);
  if (!settled) {
    return { ok: false, status: 402, error: 'Payment has not been confirmed yet.' };
  }

  const { data: existing } = await svc
    .from('connections')
    .select('id')
    .eq('client_id', request.client_id)
    .eq('provider_id', providerId)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      status: 409,
      error: 'You are already connected with this companion.',
    };
  }

  // Stamp the payment to the picked companion, claiming it once.
  const table = settled.rail === 'card' ? 'card_payments' : 'crypto_payments';
  const { data: stamped } = await svc
    .from(table)
    .update({ target_provider_id: providerId })
    .eq('reference', request.payment_ref!)
    .eq('board_request_id', request.id)
    .is('target_provider_id', null)
    .select('id')
    .maybeSingle();
  if (!stamped) {
    return { ok: false, status: 409, error: 'This payment has already been used.' };
  }

  const fee = await boardFeeNgn(svc);
  const now = new Date();
  const { data: conn, error: connErr } = await svc
    .from('connections')
    .insert({
      client_id: request.client_id,
      provider_id: providerId,
      fee_ngn: fee,
      status: 'active',
      fee_state: 'held',
      paid_at: now.toISOString(),
      dispute_deadline: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
      payment_ref: request.payment_ref,
      proposed_rate_ngn: agreedRate,
      service_type: request.service_type,
      intake_answers: intake.answers,
    })
    .select('id')
    .single();
  if (connErr || !conn) {
    return { ok: false, status: 500, error: 'Could not create the connection' };
  }

  // A filled board request is a paid connection like any other, so
  // it grants the referral reward on the same terms as a direct
  // connection (the helper guards first-connection-only itself).
  await maybeGrantReferralReward(svc, request.client_id, conn.id);

  await svc
    .from('board_requests')
    .update({
      status: 'filled',
      picked_provider_id: providerId,
      connection_id: conn.id,
      updated_at: now.toISOString(),
    })
    .eq('id', request.id)
    .eq('status', 'open');

  await notifyUsers({
    userIds: [providerId],
    type: 'new_connection',
    title: 'New connection',
    body: 'A client just connected with you. Say hello in Messages.',
    link: '/bookings',
  }).catch(() => {});
  const name =
    (provider as { display_name?: string | null }).display_name ?? 'your companion';
  await notifyUsers({
    userIds: [request.client_id],
    type: 'board_filled',
    title: 'Request filled',
    body: `You are connected with ${name}. Say hello in Messages.`,
    link: '/messages',
  }).catch(() => {});

  return { ok: true, connectionId: conn.id };
}

/**
 * Cron sweep: settle stragglers, expire due requests (refunding
 * their fees), and retry failed or pending refunds.
 */
export async function sweepBoard(
  svc: SupabaseClient
): Promise<{ settled: number; expired: number; refundsRetried: number }> {
  let settled = 0;
  let expired = 0;
  let refundsRetried = 0;

  const { data: awaiting } = await svc
    .from('board_requests')
    .select('*')
    .eq('status', 'awaiting_payment')
    .not('payment_ref', 'is', null)
    .limit(50);
  for (const row of (awaiting ?? []) as BoardRequestRow[]) {
    const after = await settleOpenIfPaid(svc, row);
    if (after.status === 'open') settled++;
  }

  const { data: open } = await svc
    .from('board_requests')
    .select('*')
    .eq('status', 'open')
    .lt('expires_at', new Date().toISOString())
    .limit(50);
  for (const row of (open ?? []) as BoardRequestRow[]) {
    const after = await expireIfDue(svc, row);
    if (after.status === 'expired') expired++;
  }

  const { data: retry } = await svc
    .from('board_requests')
    .select('*')
    .in('status', ['expired', 'cancelled'])
    .in('refund_state', ['pending', 'failed'])
    .lt('updated_at', new Date(Date.now() - 3600 * 1000).toISOString())
    .limit(20);
  for (const row of (retry ?? []) as BoardRequestRow[]) {
    if (row.payment_rail === 'card' || row.payment_rail === 'coins') {
      await attemptRefund(svc, row);
      refundsRetried++;
    }
  }

  return { settled, expired, refundsRetried };
}
