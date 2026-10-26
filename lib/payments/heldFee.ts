import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyUsers } from '@/lib/push-server';
import {
  refundTransaction,
  refundAmountNgn,
  getRefundPct,
  listRefundsForTransaction,
  refundStateForGatewayStatus,
  resolvePaystackConfig,
} from '@/lib/payments/paystack';
import { formatPrice } from '@/lib/utils/helpers';

/**
 * Held connection fees: the pay-first lifecycle (migration 078).
 *
 * A connection fee is paid up front for a chosen companion. When
 * the payment settles, availability decides what happens next:
 * she is available, the connection opens and the fee is applied;
 * she is not, no connection is created and the fee is HELD on its
 * payment row. A held fee is a platform credit toward a
 * connection, never a route around the fee: it can be applied
 * once, to one available companion, through the same eligibility
 * and screening checks a fresh booking passes, or it refunds at
 * the platform refund_pct (85) when the client takes none of the
 * options or the hold window closes.
 *
 * The lifecycle lives on the payment row (card_payments or
 * crypto_payments), so one row states what the fee is for at each
 * stage: target_provider_id is who was chosen, applied_provider_id
 * is who the fee finally connected, fee_disposition tracks
 * open/applied/refund states. Board payments are excluded
 * everywhere here; the board runs its own lifecycle.
 *
 * Every read tolerates the pre-migration shape (the fee_
 * columns missing) by falling back to the legacy columns, so this
 * code can deploy ahead of migration 078 without breaking the
 * settlement paths it touches: the hold logic simply stays
 * dormant until the columns exist.
 */

/** How long an unused fee stays applicable before the refund
 * path takes over. Matches the request board's open window. */
export const FEE_HOLD_HOURS = 48;

export type FeeDisposition =
  | 'open'
  | 'applied'
  | 'refund_pending'
  | 'refunded'
  | 'refund_failed';

export interface HeldFee {
  rail: 'card' | 'crypto';
  reference: string;
  userId: string;
  amountNgn: number;
  targetProviderId: string | null;
  appliedProviderId: string | null;
  disposition: FeeDisposition;
  feeHeldAt: string | null;
  feeExpiresAt: string | null;
  /** When the gateway settled the payment (row updated_at). */
  settledAt: string | null;
}

const FULL_COLUMNS =
  'user_id, kind, reference, amount_ngn, target_provider_id, status, board_request_id, fee_disposition, applied_provider_id, fee_held_at, fee_expires_at, updated_at';
const LEGACY_COLUMNS =
  'user_id, kind, reference, amount_ngn, target_provider_id, status, board_request_id, updated_at';

interface RawFeeRow {
  user_id?: string;
  kind?: string;
  reference?: string;
  amount_ngn?: number;
  target_provider_id?: string | null;
  status?: string;
  board_request_id?: string | null;
  fee_disposition?: string;
  applied_provider_id?: string | null;
  fee_held_at?: string | null;
  fee_expires_at?: string | null;
  updated_at?: string | null;
}

function toHeldFee(rail: 'card' | 'crypto', row: RawFeeRow): HeldFee | null {
  if (row.kind !== 'connection_fee') return null;
  if (row.board_request_id) return null;
  if (!row.reference || !row.user_id) return null;
  const settled =
    rail === 'card' ? row.status === 'paid' : row.status === 'finished';
  if (!settled) return null;
  const disposition = (row.fee_disposition ?? 'open') as FeeDisposition;
  return {
    rail,
    reference: row.reference,
    userId: row.user_id,
    amountNgn: Number(row.amount_ngn ?? 0),
    targetProviderId: row.target_provider_id ?? null,
    appliedProviderId: row.applied_provider_id ?? null,
    disposition,
    feeHeldAt: row.fee_held_at ?? null,
    feeExpiresAt: row.fee_expires_at ?? null,
    settledAt: row.updated_at ?? null,
  };
}

async function readRow(
  svc: SupabaseClient,
  table: 'card_payments' | 'crypto_payments',
  reference: string
): Promise<RawFeeRow | null> {
  const full = await svc
    .from(table)
    .select(FULL_COLUMNS)
    .eq('reference', reference)
    .maybeSingle();
  if (!full.error && full.data) return full.data as RawFeeRow;
  if (full.error) {
    // Pre-migration shape: read the legacy columns instead.
    const legacy = await svc
      .from(table)
      .select(LEGACY_COLUMNS)
      .eq('reference', reference)
      .maybeSingle();
    if (!legacy.error && legacy.data) return legacy.data as RawFeeRow;
  }
  return null;
}

/**
 * Load a settled, board-free connection fee by reference, from
 * whichever rail holds it. Returns null when the reference is not
 * a settled connection fee at all.
 */
export async function loadHeldFee(
  svc: SupabaseClient,
  reference: string
): Promise<HeldFee | null> {
  const card = await readRow(svc, 'card_payments', reference);
  if (card) return toHeldFee('card', card);
  const crypto = await readRow(svc, 'crypto_payments', reference);
  if (crypto) return toHeldFee('crypto', crypto);
  return null;
}

/** True when a connection already consumed this payment reference. */
export async function feeConsumed(
  svc: SupabaseClient,
  reference: string
): Promise<boolean> {
  const { data } = await svc
    .from('connections')
    .select('id')
    .eq('payment_ref', reference)
    .maybeSingle();
  return !!data;
}

/**
 * Availability, defined from the presence data the app already
 * maintains (the same definition the request modal has always
 * used): a companion is unavailable exactly when her presence row
 * says so. No row yet means she has not opted out of anything, so
 * she reads as available.
 */
export async function isProviderUnavailable(
  svc: SupabaseClient,
  providerId: string
): Promise<boolean> {
  const { data } = await svc
    .from('provider_presence')
    .select('is_available')
    .eq('provider_id', providerId)
    .maybeSingle();
  return !!data && data.is_available === false;
}

/** When this held fee stops being applicable. */
export function feeExpiry(fee: HeldFee): Date {
  if (fee.feeExpiresAt) return new Date(fee.feeExpiresAt);
  const base = fee.feeHeldAt ?? fee.settledAt;
  const start = base ? new Date(base).getTime() : Date.now();
  return new Date(start + FEE_HOLD_HOURS * 3600 * 1000);
}

async function companionName(
  svc: SupabaseClient,
  providerId: string | null
): Promise<string> {
  if (!providerId) return 'Your companion';
  const { data } = await svc
    .from('profiles')
    .select('display_name')
    .eq('id', providerId)
    .maybeSingle();
  return (
    (data as { display_name?: string | null } | null)?.display_name ??
    'Your companion'
  );
}

/**
 * Stamp a settled, unused fee as held and tell the client. Only
 * the call that actually stamps it notifies, so repeated settler
 * runs never spam. Best effort throughout: a failed stamp leaves
 * the fee loadable as open, and the sweep picks it up later.
 */
export async function materializeHold(
  svc: SupabaseClient,
  fee: HeldFee
): Promise<void> {
  if (fee.disposition !== 'open' || fee.feeHeldAt) return;
  const now = new Date();
  const expires = new Date(now.getTime() + FEE_HOLD_HOURS * 3600 * 1000);
  const table = fee.rail === 'card' ? 'card_payments' : 'crypto_payments';
  const { data: stamped } = await svc
    .from(table)
    .update({
      fee_held_at: now.toISOString(),
      fee_expires_at: expires.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('reference', fee.reference)
    .eq('fee_disposition', 'open')
    .is('fee_held_at', null)
    .select('reference')
    .maybeSingle();
  if (!stamped) return;

  const name = await companionName(svc, fee.targetProviderId);
  const pct = await getRefundPct(svc);
  const refund = refundAmountNgn(fee.amountNgn, pct);
  const until = expires.toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  await notifyUsers({
    userIds: [fee.userId],
    type: 'fee_held',
    title: 'Your connection fee is being held',
    body: `${name} is not available right now, so no connection was opened. Your ${formatPrice(fee.amountNgn)} fee is held safely until ${until}. Apply it to another available companion, or take a refund of ${formatPrice(refund)} (${pct}% back).`,
    link: `/connections/fee?ref=${encodeURIComponent(fee.reference)}`,
  }).catch(() => {});
}

/** Record that this fee opened a connection with this companion. */
export async function stampApplied(
  svc: SupabaseClient,
  fee: HeldFee,
  providerId: string
): Promise<void> {
  const table = fee.rail === 'card' ? 'card_payments' : 'crypto_payments';
  await svc
    .from(table)
    .update({
      fee_disposition: 'applied',
      applied_provider_id: providerId,
      updated_at: new Date().toISOString(),
    })
    .eq('reference', fee.reference)
    .eq('fee_disposition', 'open');
}

export interface FeeRefundOutcome {
  state: FeeDisposition;
  refundAmountNgn: number;
  pct: number;
}

/**
 * Attempt the refund_pct refund of an unused held fee through the
 * original rail, mirroring the board's refund discipline: adopt a
 * gateway refund that already exists before creating another, and
 * never refund a fee a connection has consumed. Crypto refunds
 * are manual at the gateway, so they park at refund_pending for
 * an admin to complete, exactly like board crypto refunds.
 */
export async function attemptFeeRefund(
  svc: SupabaseClient,
  fee: HeldFee,
  opts?: { expired?: boolean }
): Promise<FeeRefundOutcome> {
  const pct = await getRefundPct(svc);
  const refund = refundAmountNgn(fee.amountNgn, pct);
  const table = fee.rail === 'card' ? 'card_payments' : 'crypto_payments';

  if (fee.disposition === 'refunded') {
    return { state: 'refunded', refundAmountNgn: refund, pct };
  }
  if (fee.disposition === 'applied' || (await feeConsumed(svc, fee.reference))) {
    return { state: 'applied', refundAmountNgn: 0, pct };
  }

  const setDisposition = async (state: FeeDisposition) => {
    await svc
      .from(table)
      .update({ fee_disposition: state, updated_at: new Date().toISOString() })
      .eq('reference', fee.reference);
  };
  const tellClient = async (state: FeeDisposition) => {
    const lead = opts?.expired
      ? 'Your held connection fee was never used, so its hold has ended. '
      : '';
    if (state === 'refunded') {
      await notifyUsers({
        userIds: [fee.userId],
        type: 'fee_refunded',
        title: 'Your refund is on its way',
        body: `${lead}${formatPrice(refund)} (${pct}% of your ${formatPrice(fee.amountNgn)} connection fee) has been refunded through the way you paid. The rest is the processing share in the refund policy.`,
        link: '/wallet',
      }).catch(() => {});
    } else if (state === 'refund_pending') {
      await notifyUsers({
        userIds: [fee.userId],
        type: 'fee_refunded',
        title: 'Your refund is being processed',
        body: `${lead}Your refund of ${formatPrice(refund)} (${pct}% of your ${formatPrice(fee.amountNgn)} connection fee) is being processed. It lands through the way you paid; if it takes more than a few days, contact support.`,
        link: '/wallet',
      }).catch(() => {});
    }
  };

  if (fee.rail === 'crypto') {
    if (fee.disposition !== 'refund_pending') {
      await setDisposition('refund_pending');
      await tellClient('refund_pending');
    }
    return { state: 'refund_pending', refundAmountNgn: refund, pct };
  }

  // Card rail: adopt a live gateway refund before creating one.
  const paystackConfig = await resolvePaystackConfig(svc);
  const existing = await listRefundsForTransaction(fee.reference, paystackConfig);
  const live = existing.find(
    (r) => refundStateForGatewayStatus(r.status) !== 'failed'
  );
  if (live) {
    const state = refundStateForGatewayStatus(live.status);
    await setDisposition(state === 'refunded' ? 'refunded' : 'refund_pending');
    if (state === 'refunded') await tellClient('refunded');
    return {
      state: state === 'refunded' ? 'refunded' : 'refund_pending',
      refundAmountNgn: refund,
      pct,
    };
  }

  try {
    const result = await refundTransaction(fee.reference, refund * 100, paystackConfig);
    const state: FeeDisposition =
      result.status === 'success'
        ? 'refunded'
        : result.status === 'pending'
          ? 'refund_pending'
          : 'refund_failed';
    await setDisposition(state);
    if (state === 'refunded') await tellClient('refunded');
    if (state === 'refund_pending') await tellClient('refund_pending');
    return { state, refundAmountNgn: refund, pct };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Refund request failed';
    // A refusal saying a refund already covers this charge means
    // one exists after all: adopt it instead of failing.
    if (/exceed/i.test(message)) {
      const again = await listRefundsForTransaction(fee.reference, paystackConfig);
      const found = again.find(
        (r) => refundStateForGatewayStatus(r.status) !== 'failed'
      );
      if (found) {
        const state =
          refundStateForGatewayStatus(found.status) === 'refunded'
            ? 'refunded'
            : 'refund_pending';
        await setDisposition(state);
        if (state === 'refunded') await tellClient('refunded');
        return { state, refundAmountNgn: refund, pct };
      }
    }
    console.error(`held fee refund failed for ${fee.reference}: ${message}`);
    await setDisposition('refund_failed');
    return { state: 'refund_failed', refundAmountNgn: refund, pct };
  }
}

export interface SimilarProvider {
  providerId: string;
  username: string | null;
  name: string;
  avatar: string | null;
  city: string | null;
  rateShortTime: number | null;
  services: string[];
}

/**
 * Similar available companions for a held fee's target: verified,
 * presence-available companions, same city first, scored by
 * service overlap with the original companion. The server-side
 * twin of the modal's findSimilar.
 */
export async function similarProvidersFor(
  svc: SupabaseClient,
  targetProviderId: string,
  limit = 3
): Promise<SimilarProvider[]> {
  const { data: target } = await svc
    .from('profiles')
    .select('services')
    .eq('id', targetProviderId)
    .maybeSingle();
  const targetServices: string[] = Array.isArray(target?.services)
    ? (target.services as string[])
    : [];
  const { data: presence } = await svc
    .from('provider_presence')
    .select('city')
    .eq('provider_id', targetProviderId)
    .maybeSingle();
  const city = (presence as { city?: string } | null)?.city ?? null;

  let q = svc
    .from('map_providers')
    .select(
      'provider_id, username, display_name, avatar_url, city, rate_short_time_ngn, services'
    )
    .eq('is_available', true)
    .neq('provider_id', targetProviderId)
    .limit(20);
  if (city) q = q.eq('city', city);
  const { data } = await q;
  if (!data) return [];

  const scored = data.map((r) => {
    const row = r as Record<string, unknown>;
    const svcList: string[] = Array.isArray(row.services)
      ? (row.services as string[])
      : [];
    const overlap =
      targetServices.length > 0
        ? svcList.filter((x) => targetServices.includes(x)).length
        : 0;
    return {
      providerId: row.provider_id as string,
      username: (row.username as string | null) ?? null,
      name: (row.display_name as string | null) ?? 'Intima companion',
      avatar: (row.avatar_url as string | null) ?? null,
      city: (row.city as string | null) ?? null,
      rateShortTime: (row.rate_short_time_ngn as number | null) ?? null,
      services: svcList,
      score: overlap,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ score, ...rest }) => {
    void score;
    return rest;
  });
}

/** Open holds, oldest first: the cron sweep's working set. */
export async function listOpenHolds(
  svc: SupabaseClient,
  limit = 50
): Promise<HeldFee[]> {
  const out: HeldFee[] = [];
  for (const [table, rail] of [
    ['card_payments', 'card'],
    ['crypto_payments', 'crypto'],
  ] as const) {
    const { data } = await svc
      .from(table)
      .select(FULL_COLUMNS)
      .eq('kind', 'connection_fee')
      .is('board_request_id', null)
      .eq('fee_disposition', 'open')
      .order('updated_at', { ascending: true })
      .limit(limit);
    for (const row of (data ?? []) as RawFeeRow[]) {
      const fee = toHeldFee(rail, row);
      if (fee) out.push(fee);
    }
  }
  return out;
}

/**
 * Cron sweep for held fees: holds whose window has closed refund
 * at refund_pct, and stuck card refunds (pending or failed for
 * over an hour) retry, adopting any gateway refund that already
 * exists. Completion retries for companions who came back online
 * run in the cron route itself, through the normal settler.
 */
export async function sweepHeldFees(
  svc: SupabaseClient
): Promise<{ expired: number; refundsRetried: number }> {
  let expired = 0;
  let refundsRetried = 0;

  const holds = await listOpenHolds(svc);
  for (const fee of holds) {
    if (await feeConsumed(svc, fee.reference)) continue;
    if (feeExpiry(fee).getTime() > Date.now()) continue;
    const outcome = await attemptFeeRefund(svc, fee, { expired: true });
    if (outcome.state !== 'applied') expired++;
  }

  for (const [table, rail] of [
    ['card_payments', 'card'],
    ['crypto_payments', 'crypto'],
  ] as const) {
    const { data } = await svc
      .from(table)
      .select(FULL_COLUMNS)
      .eq('kind', 'connection_fee')
      .is('board_request_id', null)
      .in('fee_disposition', ['refund_pending', 'refund_failed'])
      .lt('updated_at', new Date(Date.now() - 3600 * 1000).toISOString())
      .limit(20);
    for (const row of (data ?? []) as RawFeeRow[]) {
      const fee = toHeldFee(rail, {
        ...row,
        // toHeldFee needs a settled status; refund rows are settled
        // by definition, but status still carries it.
        status: row.status,
      });
      if (!fee || fee.rail !== 'card') continue;
      await attemptFeeRefund(svc, fee);
      refundsRetried++;
    }
  }

  return { expired, refundsRetried };
}
