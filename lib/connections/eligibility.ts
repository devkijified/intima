import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Bybit P2P counterparty conditions, translated to Intima: a companion
 * sets who may open a connection with her; the client sees exactly what
 * he is missing before any fee moves. One engine, used by the profile
 * page (display) and the connections API (enforcement).
 */

export interface CompanionRequirements {
  req_verified_client: boolean;
  req_min_connections: number;
  req_min_account_days: number;
}

export interface EligibilityCheck {
  key: 'verified' | 'connections' | 'account_age';
  label: string;
  ok: boolean;
  have: string;
}

export interface Eligibility {
  eligible: boolean;
  checks: EligibilityCheck[];
  completedConnections: number;
  completionRate: number | null;
}

export function hasRequirements(r: CompanionRequirements): boolean {
  return r.req_verified_client || r.req_min_connections > 0 || r.req_min_account_days > 0;
}

export async function evaluateEligibility(
  supabase: SupabaseClient,
  clientId: string,
  accountCreatedAt: string | null,
  req: CompanionRequirements
): Promise<Eligibility> {
  const checks: EligibilityCheck[] = [];

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_verified, verification_status')
    .eq('id', clientId)
    .maybeSingle();
  const isVerified =
    profile?.is_verified === true || profile?.verification_status === 'verified';

  const [{ count: completed }, { count: settled }] = await Promise.all([
    supabase
      .from('connections')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'active'),
    supabase
      .from('connections')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .in('status', ['active', 'refunded']),
  ]);
  const completedConnections = completed ?? 0;
  const completionRate =
    settled && settled > 0 ? Math.round((completedConnections / settled) * 100) : null;

  const ageDays = accountCreatedAt
    ? Math.floor((Date.now() - new Date(accountCreatedAt).getTime()) / 86_400_000)
    : 0;

  if (req.req_verified_client) {
    checks.push({
      key: 'verified',
      label: 'ID verified client',
      ok: isVerified,
      have: isVerified ? 'You are verified' : 'You are not verified yet',
    });
  }
  if (req.req_min_connections > 0) {
    checks.push({
      key: 'connections',
      label: `At least ${req.req_min_connections} completed bookings`,
      ok: completedConnections >= req.req_min_connections,
      have: `You have ${completedConnections}`,
    });
  }
  if (req.req_min_account_days > 0) {
    checks.push({
      key: 'account_age',
      label: `Account at least ${req.req_min_account_days} days old`,
      ok: ageDays >= req.req_min_account_days,
      have: `Your account is ${ageDays} days old`,
    });
  }

  return {
    eligible: checks.every((c) => c.ok),
    checks,
    completedConnections,
    completionRate,
  };
}
