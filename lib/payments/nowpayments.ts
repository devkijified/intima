import crypto from 'node:crypto';

/**
 * NOWPayments integration: the no-KYC crypto gateway.
 * Signup is email-only for crypto-to-crypto payments; customers pay in
 * USDT/BTC/etc., settlement lands in our own payout wallet (custody
 * mode off). Fees are 0.5% crypto-to-crypto. Fiat would require KYC,
 * so Intima prices invoices in USD and stays crypto-only.
 *
 * Dormant until NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET are set.
 */

const API_BASE = 'https://api.nowpayments.io/v1';

export function cryptoConfigured(): boolean {
  return !!process.env.NOWPAYMENTS_API_KEY && !!process.env.NOWPAYMENTS_IPN_SECRET;
}

export interface CryptoInvoice {
  invoiceId: string;
  invoiceUrl: string;
}

/** Create a hosted invoice. Amount is USD (converted from NGN by caller). */
export async function createCryptoInvoice(opts: {
  amountUsd: number;
  orderId: string;
  description: string;
  ipnCallbackUrl: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CryptoInvoice> {
  const res = await fetch(`${API_BASE}/invoice`, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.NOWPAYMENTS_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_amount: opts.amountUsd,
      price_currency: 'usd',
      order_id: opts.orderId,
      order_description: opts.description,
      ipn_callback_url: opts.ipnCallbackUrl,
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`NOWPayments invoice failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: string | number; invoice_url: string };
  return { invoiceId: String(data.id), invoiceUrl: data.invoice_url };
}

/**
 * Verify an IPN callback signature. NOWPayments signs the JSON body
 * with HMAC-SHA512 using the IPN secret, over the payload serialized
 * with recursively sorted keys. Header: x-nowpayments-sig.
 */
export function verifyIpnSignature(body: unknown, signature: string | null): boolean {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signature) return false;
  const sorted = sortDeep(body);
  const payload = JSON.stringify(sorted);
  const expected = crypto.createHmac('sha512', secret).update(payload).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Map gateway statuses onto ours. 'finished' is the only credit-worthy state. */
export function mapGatewayStatus(status: string): 'finished' | 'failed' | 'expired' | 'partial' | 'pending' {
  switch (status) {
    case 'finished':
      return 'finished';
    case 'failed':
      return 'failed';
    case 'expired':
      return 'expired';
    case 'partially_paid':
      return 'partial';
    default:
      return 'pending';
  }
}
