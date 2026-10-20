import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * GET /api/cron/reconcile
 * Compares every coin_balances row against the ledger:
 *   expected = baseline.balance + sum(coin_ledger deltas for the user)
 * A mismatch means a balance moved without a ledger row (or the other
 * way round) and is written to error_logs with source 'reconcile'.
 *
 * Users with no baseline row: if they also have no ledger rows there
 * is nothing to check, so they are skipped. If they have ledger rows
 * but no baseline (for example a balance created after migration
 * 036), a baseline is backfilled as current balance minus the ledger
 * sum, which makes future checks exact, and the user is not flagged
 * this run.
 *
 * Auth: same as poll-transfers, Authorization Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: balances, error: balErr } = await svc
      .from('coin_balances')
      .select('user_id, balance');
    if (balErr) throw balErr;

    const { data: baselines, error: baseErr } = await svc
      .from('coin_ledger_baseline')
      .select('user_id, balance');
    if (baseErr) throw baseErr;

    const { data: ledgerRows, error: ledgerErr } = await svc
      .from('coin_ledger')
      .select('user_id, delta');
    if (ledgerErr) throw ledgerErr;

    const baselineByUser = new Map<string, number>();
    for (const row of baselines ?? []) {
      baselineByUser.set(row.user_id as string, row.balance as number);
    }

    const ledgerSumByUser = new Map<string, number>();
    const ledgerCountByUser = new Map<string, number>();
    for (const row of ledgerRows ?? []) {
      const uid = row.user_id as string;
      ledgerSumByUser.set(uid, (ledgerSumByUser.get(uid) ?? 0) + (row.delta as number));
      ledgerCountByUser.set(uid, (ledgerCountByUser.get(uid) ?? 0) + 1);
    }

    let checked = 0;
    let mismatches = 0;

    for (const bal of balances ?? []) {
      const userId = bal.user_id as string;
      const actual = bal.balance as number;
      const ledgerSum = ledgerSumByUser.get(userId) ?? 0;
      const baseline = baselineByUser.get(userId);

      if (baseline === undefined) {
        if ((ledgerCountByUser.get(userId) ?? 0) === 0) {
          continue;
        }
        // Backfill a baseline so future runs check this user exactly.
        await svc.from('coin_ledger_baseline').insert({
          user_id: userId,
          balance: actual - ledgerSum,
        });
        checked += 1;
        continue;
      }

      checked += 1;
      const expected = baseline + ledgerSum;
      if (actual !== expected) {
        mismatches += 1;
        await svc.from('error_logs').insert({
          message: `Coin balance mismatch for user ${userId}: expected ${expected}, actual ${actual}`,
          route: '/api/cron/reconcile',
          source: 'reconcile',
          user_id: userId,
        });
      }
    }

    return NextResponse.json({ checked, mismatches });
  } catch (e) {
    console.error('[reconcile]', e);
    return NextResponse.json({ error: 'Reconcile failed' }, { status: 500 });
  }
}
