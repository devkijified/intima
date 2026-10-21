import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side proof that a connection fee was actually paid.
 *
 * POST /api/connections receives only a client-supplied payment_ref.
 * A reference is a claim, not a payment: before this check existed,
 * any signed-in user could invent a reference and open a connection
 * without the ₦5,000 fee ever moving. This helper cross-checks the
 * claim against the settled payment row the gateways wrote:
 *
 * - Card rail (Paystack, card or bank transfer): a card_payments row
 *   flipped to 'paid' by the verify endpoint or the webhook.
 * - Crypto rail (NOWPayments): a crypto_payments row flipped to
 *   'finished' by the signature-verified IPN webhook.
 *
 * The row must belong to the caller, be for the connection fee, name
 * the same companion the connection targets, and carry exactly the
 * current fee from platform_settings. Each settled payment opens
 * exactly one connection: a reference already carried by an existing
 * connection is rejected.
 */

export type ConnectionFeeProof =
  | { ok: true; rail: 'card' | 'crypto' }
  | { ok: false; status: 402 | 409; error: string };

const NOT_CONFIRMED = 'Payment has not been confirmed yet.';

export async function verifyConnectionFeePayment(
  svc: SupabaseClient,
  input: {
    userId: string;
    providerId: string;
    paymentRef: string;
    feeNgn: number;
  }
): Promise<ConnectionFeeProof> {
  const { userId, providerId, paymentRef, feeNgn } = input;

  const { data: card } = await svc
    .from('card_payments')
    .select('status, amount_ngn, target_provider_id')
    .eq('reference', paymentRef)
    .eq('user_id', userId)
    .eq('kind', 'connection_fee')
    .maybeSingle();

  const { data: crypto } = !card
    ? await svc
        .from('crypto_payments')
        .select('status, amount_ngn, target_provider_id')
        .eq('reference', paymentRef)
        .eq('user_id', userId)
        .eq('kind', 'connection_fee')
        .maybeSingle()
    : { data: null };

  const row = card
    ? { settled: card.status === 'paid', amount: card.amount_ngn, target: card.target_provider_id, rail: 'card' as const }
    : crypto
      ? { settled: crypto.status === 'finished', amount: crypto.amount_ngn, target: crypto.target_provider_id, rail: 'crypto' as const }
      : null;

  if (!row || !row.settled) {
    return { ok: false, status: 402, error: NOT_CONFIRMED };
  }
  if (row.target !== providerId || Number(row.amount) !== feeNgn) {
    return { ok: false, status: 402, error: NOT_CONFIRMED };
  }

  // Single-use: one settled fee opens one connection, ever.
  const { data: used } = await svc
    .from('connections')
    .select('id')
    .eq('payment_ref', paymentRef)
    .maybeSingle();
  if (used) {
    return {
      ok: false,
      status: 409,
      error: 'This payment has already been used for a connection.',
    };
  }

  return { ok: true, rail: row.rail };
}
