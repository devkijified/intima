import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Paystack, plug-and-play: set PAYSTACK_SECRET_KEY in the environment
 * and every card surface lights up (methods endpoint reports card:
 * true, the booking modal switches from Test mode to card checkout,
 * the coins page shows the Card tab). Remove the key and it all goes
 * dormant again. No code changes either way.
 *
 * Settlement safety: crediting is idempotent everywhere. Coins settle
 * through settleCoinTopup() (guarded by the coin_topups reference);
 * connection fees settle through the card_payments status guard.
 */

const API_BASE = 'https://api.paystack.co';

export function paystackConfigured(): boolean {
  return !!process.env.PAYSTACK_SECRET_KEY;
}

export function paystackTestMode(): boolean {
  return (process.env.PAYSTACK_SECRET_KEY ?? '').startsWith('sk_test_');
}

/**
 * Checkout channels a client may explicitly choose. Both ride the same
 * rails: initialize with the channel pinned, and the charge.success
 * webhook settles identically either way. bank_transfer shows the
 * buyer a dedicated account number for that one transaction on the
 * Paystack checkout; the buyer transfers, Paystack confirms, and the
 * webhook fires minutes later if that is how long the bank takes.
 */
export const PAYMENT_CHANNELS = ['card', 'bank_transfer'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

/** Strict guard for a client-supplied channel choice. */
export function isPaymentChannel(value: unknown): value is PaymentChannel {
  return value === 'card' || value === 'bank_transfer';
}

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };
}

export async function initializeTransaction(opts: {
  email: string;
  amountNgn: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
  /**
   * Optional explicit channel choice. When set, the checkout is pinned
   * to that one channel. When omitted, no channels field is sent at
   * all, exactly as before, and Paystack shows the account's enabled
   * channels (the long-standing default behaviour).
   */
  channel?: PaymentChannel;
}): Promise<{ authorizationUrl: string }> {
  const payload: Record<string, unknown> = {
    email: opts.email,
    amount: Math.round(opts.amountNgn * 100), // kobo
    reference: opts.reference,
    callback_url: opts.callbackUrl,
    metadata: opts.metadata,
  };
  if (opts.channel) payload.channels = [opts.channel];
  const res = await fetch(`${API_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.status || !data?.data?.authorization_url) {
    throw new Error(data?.message ?? `Paystack initialize failed (${res.status})`);
  }
  return { authorizationUrl: data.data.authorization_url as string };
}

export interface VerifiedTransaction {
  status: string;
  amountNgn: number;
  metadata: Record<string, unknown>;
}

export async function verifyTransaction(reference: string): Promise<VerifiedTransaction> {
  const res = await fetch(
    `${API_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: authHeaders() }
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.status) {
    throw new Error(data?.message ?? `Paystack verify failed (${res.status})`);
  }
  return {
    status: data.data.status as string,
    amountNgn: Math.round((data.data.amount as number) / 100),
    metadata: (data.data.metadata ?? {}) as Record<string, unknown>,
  };
}

/**
 * Webhook signature: Paystack signs the raw request body with
 * HMAC-SHA512 keyed by the secret key. Header: x-paystack-signature.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Credit a coin top-up exactly once. The coin_topups reference is the
 * idempotency key: webhook, callback verify, and any retry can all
 * call this safely.
 */
export async function settleCoinTopup(
  svc: SupabaseClient,
  input: { reference: string; userId: string; coins: number; amountNgn: number }
): Promise<{ credited: boolean }> {
  const { data: existing } = await svc
    .from('coin_topups')
    .select('id')
    .eq('reference', input.reference)
    .maybeSingle();
  if (existing) return { credited: false };

  const { error: creditErr } = await svc.rpc('credit_coins', {
    p_user_id: input.userId,
    p_amount: input.coins,
    p_kind: 'topup_card',
    p_ref: input.reference,
    p_meta: {},
  });
  if (creditErr) throw creditErr;
  await svc.from('coin_topups').insert({
    user_id: input.userId,
    reference: input.reference,
    coins: input.coins,
    amount_ngn: input.amountNgn,
  });
  return { credited: true };
}

/** Fallback refund share, used only when the refund_pct setting
 * cannot be read. The live value lives in platform_settings
 * (Admin, Settings) so the owner can change it without a deploy. */
export const REFUND_PCT = 85;

/** The refund due on an amount, in naira: pct of it (default REFUND_PCT). */
export function refundAmountNgn(amountNgn: number, pct: number = REFUND_PCT): number {
  return Math.round((amountNgn * pct) / 100);
}

/** The live refund percentage from platform settings. */
export async function getRefundPct(
  svc: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<number> {
  try {
    const { data } = await svc
      .from('platform_settings')
      .select('value')
      .eq('key', 'refund_pct')
      .maybeSingle();
    const v = Number((data as { value?: unknown } | null)?.value);
    if (Number.isFinite(v) && v >= 0 && v <= 100) return v;
  } catch { /* fall through to the default */ }
  return REFUND_PCT;
}

/**
 * Refund a settled transaction through Paystack. Used by the
 * request board when a request expires unfilled (or is cancelled
 * after payment): the fee goes back through the rail it arrived
 * on. Pass amountKobo for a partial refund of that amount; omit
 * it to refund in full. Paystack processes refunds
 * asynchronously, so the answer is a state, not a guarantee:
 * 'success' and 'processed' mean the money is moving, 'pending'
 * means it is queued.
 */
export async function refundTransaction(
  reference: string,
  amountKobo?: number
): Promise<{ status: 'success' | 'pending' | 'failed' }> {
  const res = await fetch(`${API_BASE}/refund`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(
      amountKobo ? { transaction: reference, amount: amountKobo } : { transaction: reference }
    ),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.status) {
    throw new Error(data?.message ?? `Paystack refund failed (${res.status})`);
  }
  const s = String(data.data?.status ?? '');
  if (s === 'success' || s === 'processed') return { status: 'success' };
  if (s === 'pending' || s === 'processing') return { status: 'pending' };
  return { status: 'failed' };
}

/** Map a Paystack refund status onto the board's refund states. */
export function refundStateForGatewayStatus(
  status: string | undefined
): 'refunded' | 'pending' | 'failed' {
  const s = String(status ?? '');
  if (s === 'success' || s === 'processed') return 'refunded';
  if (s === 'pending' || s === 'processing') return 'pending';
  return 'failed';
}

interface PaystackRefundRow {
  amount?: number;
  status?: string;
}

/**
 * The refunds already sitting on a transaction at Paystack. The
 * list endpoint filters by the numeric transaction id, so resolve
 * it from our reference first. Any failure reads as "none found";
 * callers treat that as a prompt to look again, never as proof a
 * refund does not exist.
 */
export async function listRefundsForTransaction(
  reference: string
): Promise<PaystackRefundRow[]> {
  const txRes = await fetch(`${API_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: authHeaders(),
  });
  const tx = await txRes.json().catch(() => null);
  const txId = (tx?.data as { id?: number } | undefined)?.id;
  if (!txRes.ok || !txId) return [];
  const res = await fetch(`${API_BASE}/refund?transaction=${txId}&perPage=50`, {
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(data?.data)) return [];
  return data.data as PaystackRefundRow[];
}

/** Flip a card_payments row to paid, claiming the transition once. */
export async function markCardPaymentPaid(
  svc: SupabaseClient,
  reference: string
): Promise<boolean> {
  const { data } = await svc
    .from('card_payments')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('reference', reference)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  return !!data;
}
