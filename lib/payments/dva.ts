import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePaystackConfig, type PaystackConfig } from './paystack';

/**
 * Paystack Dedicated Virtual Accounts (DVA): a permanent personal
 * Naira account number per user. The user transfers any amount to it
 * from any bank; Paystack records the transfer as a transaction on
 * the merchant account and fires charge.success with
 * authorization.channel === 'dedicated_nuban'; the webhook resolves
 * the account number back to the user and credits coins at
 * 1 coin = ₦10 (see the integration snippet returned with this
 * module and settleDvaTopup below). Server-only: every call uses
 * the active Paystack mode's secret key (Admin, Settings switch).
 *
 * Eligibility (Paystack docs, checked 2026-10-21): DVA is only
 * available to registered businesses in Nigeria/Ghana that completed
 * the go-live process. When the feature is not enabled on the
 * merchant account the assignment call fails; that failure class is
 * surfaced as DvaNotEnabledError so callers can fall back to the
 * per-transaction bank_transfer checkout channel instead of erroring.
 */

const API_BASE = 'https://api.paystack.co';

export const DVA_MIN_TRANSFER_NGN = 100;
export const DVA_NGN_PER_COIN = 10;

export class DvaError extends Error {
  code: string;
  paystackStatus?: number;
  constructor(message: string, code = 'dva_error', paystackStatus?: number) {
    super(message);
    this.name = 'DvaError';
    this.code = code;
    this.paystackStatus = paystackStatus;
  }
}

/** The merchant account does not have dedicated accounts enabled. */
export class DvaNotEnabledError extends DvaError {
  constructor(message: string, paystackStatus?: number) {
    super(message, 'dva_not_enabled', paystackStatus);
    this.name = 'DvaNotEnabledError';
  }
}

export interface UserBankAccount {
  id: string;
  user_id: string;
  provider: string;
  paystack_customer_code: string | null;
  dedicated_id: string | null;
  account_number: string | null;
  bank_name: string | null;
  account_name: string | null;
  status: string;
}

interface PaystackEnvelope<T> {
  status?: boolean;
  message?: string;
  data?: T;
}

function authHeaders(secretKey: string) {
  return {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Paystack answers a refused dedicated-account call with status:false
 * and a message saying the integration is not enabled/permitted for
 * dedicated accounts (or a 403). Any other failure keeps its own
 * message so real problems (bad bank slug, validation) stay visible.
 */
function classifyError(message: string, httpStatus: number, context: string): DvaError {
  const mentionsDedicated = /dedicated/i.test(message);
  const soundsDisabled =
    /not (enabled|activated|permitted|allowed)|disabled|unavailable|not available/i.test(message);
  if ((mentionsDedicated && (soundsDisabled || httpStatus === 403)) || httpStatus === 403 && context === 'dedicated_account') {
    return new DvaNotEnabledError(message, httpStatus);
  }
  return new DvaError(message, 'dva_error', httpStatus);
}

async function paystackRequest<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: Record<string, unknown> },
  context: string,
  config: PaystackConfig
): Promise<T> {
  if (!config.secretKey) {
    throw new DvaNotEnabledError('Paystack secret key is not set for the active mode');
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method,
      headers: authHeaders(config.secretKey),
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    throw new DvaError(
      `Paystack request failed: ${err instanceof Error ? err.message : 'network error'}`,
      'dva_network_error'
    );
  }
  const data = (await res.json().catch(() => null)) as PaystackEnvelope<T> | null;
  if (!res.ok || !data?.status || data.data === undefined) {
    const message = data?.message ?? `Paystack ${context} failed (${res.status})`;
    throw classifyError(message, res.status, context);
  }
  return data.data;
}

interface PaystackCustomer {
  customer_code?: string;
  dedicated_account?: {
    id?: number;
    account_number?: string;
    account_name?: string;
    bank?: { name?: string };
  } | null;
}

interface PaystackDedicatedAccount {
  id?: number;
  account_number?: string;
  account_name?: string;
  bank?: { name?: string };
  customer?: { customer_code?: string };
}

/**
 * Which provider bank to request. Test keys must use 'test-bank'
 * (Paystack's rule); live keys default to Paystack-Titan and can be
 * overridden with PAYSTACK_DVA_BANK (e.g. 'wema-bank').
 */
function preferredBank(config: PaystackConfig): string {
  if (config.secretKey.startsWith('sk_test_')) return 'test-bank';
  return process.env.PAYSTACK_DVA_BANK || 'titan-paystack';
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? 'Intima';
  const lastName = parts.slice(1).join(' ') || firstName;
  return { firstName, lastName };
}

/**
 * Return the user's dedicated account, creating it on first call:
 * stored row wins; otherwise reuse-or-create the Paystack customer
 * (looked up by email), assign a dedicated account with the
 * synchronous POST /dedicated_account call, persist, return.
 * Throws DvaNotEnabledError when the merchant account has not
 * enabled DVA; DvaError (message preserved from Paystack) otherwise.
 */
export async function getOrCreateUserDedicatedAccount(
  svc: SupabaseClient,
  user: { id: string; email: string; fullName: string; phone?: string | null }
): Promise<UserBankAccount> {
  const { data: stored } = await svc
    .from('user_bank_accounts')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (stored?.account_number && stored.status === 'active') {
    return stored as UserBankAccount;
  }

  const config = await resolvePaystackConfig(svc);

  // Reuse the Paystack customer for this email if one exists; the
  // fetch response also carries an already-assigned dedicated
  // account, which heals rows lost on our side.
  let customerCode: string | null =
    (stored?.paystack_customer_code as string | null) ?? null;
  let existing = null as PaystackCustomer['dedicated_account'];
  try {
    const found = await paystackRequest<PaystackCustomer>(
      `/customer/${encodeURIComponent(user.email)}`,
      { method: 'GET' },
      'customer_fetch',
      config
    );
    customerCode = found.customer_code ?? customerCode;
    existing = found.dedicated_account ?? null;
  } catch (err) {
    // A 404 here just means "no customer yet"; anything else is real.
    if (!(err instanceof DvaError && err.paystackStatus === 404)) throw err;
  }

  if (!customerCode) {
    const { firstName, lastName } = splitName(user.fullName);
    const created = await paystackRequest<PaystackCustomer>(
      '/customer',
      {
        method: 'POST',
        body: {
          email: user.email,
          first_name: firstName,
          last_name: lastName,
          ...(user.phone ? { phone: user.phone } : {}),
        },
      },
      'customer_create',
      config
    );
    customerCode = created.customer_code ?? null;
    if (!customerCode) {
      throw new DvaError('Paystack customer creation returned no customer_code');
    }
  }

  let accountNumber = existing?.account_number ?? null;
  let accountName = existing?.account_name ?? null;
  let bankName = existing?.bank?.name ?? null;
  let dedicatedId = existing?.id != null ? String(existing.id) : null;

  if (!accountNumber) {
    const assigned = await paystackRequest<PaystackDedicatedAccount>(
      '/dedicated_account',
      {
        method: 'POST',
        body: { customer: customerCode, preferred_bank: preferredBank(config) },
      },
      'dedicated_account',
      config
    );
    accountNumber = assigned.account_number ?? null;
    accountName = assigned.account_name ?? null;
    bankName = assigned.bank?.name ?? null;
    dedicatedId = assigned.id != null ? String(assigned.id) : null;
    customerCode = assigned.customer?.customer_code ?? customerCode;
  }

  if (!accountNumber) {
    throw new DvaError('Paystack dedicated account assignment returned no account number');
  }

  const now = new Date().toISOString();
  const { data: row, error } = await svc
    .from('user_bank_accounts')
    .upsert(
      {
        user_id: user.id,
        provider: 'paystack_dva',
        paystack_customer_code: customerCode,
        dedicated_id: dedicatedId,
        account_number: accountNumber,
        bank_name: bankName,
        account_name: accountName,
        status: 'active',
        updated_at: now,
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single();
  if (error) throw new DvaError(`Could not store dedicated account: ${error.message}`);
  return row as UserBankAccount;
}

/** Coin credit math for a DVA transfer: 1 coin per ₦10, floored. */
export function dvaCreditMath(amountNgn: number): { coins: number; belowMinimum: boolean } {
  if (!Number.isFinite(amountNgn) || amountNgn < DVA_MIN_TRANSFER_NGN) {
    return { coins: 0, belowMinimum: true };
  }
  return { coins: Math.floor(amountNgn / DVA_NGN_PER_COIN), belowMinimum: false };
}

/**
 * Credit a DVA transfer exactly once, mirroring settleCoinTopup:
 * the coin_topups reference (the Paystack transaction reference) is
 * the idempotency key, and credit_coins is itself idempotent on
 * (kind, ref). Ledger kind 'topup_transfer': a bank transfer into
 * the user's own account number.
 */
export async function settleDvaTopup(
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
    p_kind: 'topup_transfer',
    p_ref: input.reference,
    p_meta: { rail: 'paystack_dva' },
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
