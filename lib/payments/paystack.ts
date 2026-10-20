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
}): Promise<{ authorizationUrl: string }> {
  const res = await fetch(`${API_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      email: opts.email,
      amount: Math.round(opts.amountNgn * 100), // kobo
      reference: opts.reference,
      callback_url: opts.callbackUrl,
      metadata: opts.metadata,
    }),
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
