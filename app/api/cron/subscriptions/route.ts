import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notifyUsers } from '@/lib/push-server';

/**
 * GET /api/cron/subscriptions
 * Fan club renewals. Every active subscription whose paid period has
 * ended is charged again in coins for the next 30 days:
 *
 * 1. spend_coins on the subscriber, kind 'subscription_charge', with
 *    ref = subscription id + ':' + the new period end date
 *    (yyyy-mm-dd). The marker makes each period's charge traceable.
 * 2. On success the period rolls forward from the old period end
 *    (not from now, so a late run never shortens a paid period) and
 *    the provider is credited her share via credit_coins, kind
 *    'subscription_earning', same marker as ref. credit_coins is
 *    idempotent on (kind, ref), so a retried run never pays twice.
 * 3. On insufficient balance the subscription lapses and the fan is
 *    notified that they can resubscribe anytime.
 *
 * Cancelled subscriptions are never selected here: cancelling keeps
 * perks until current_period_end and then simply ends.
 *
 * Auth: callers send `Authorization: Bearer <CRON_SECRET>`, same as
 * the other cron routes.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Platform cut from platform_settings, never hardcoded; 50 is only
  // the fallback when the settings row is missing.
  const { data: settings } = await svc
    .from('platform_settings')
    .select('value')
    .eq('key', 'subscription_platform_cut_pct')
    .maybeSingle();
  const rawCut = settings?.value as unknown;
  const parsedCut =
    typeof rawCut === 'number'
      ? rawCut
      : typeof rawCut === 'string'
        ? Number(rawCut)
        : NaN;
  const cutPct =
    Number.isFinite(parsedCut) && parsedCut >= 0 && parsedCut <= 100
      ? parsedCut
      : 50;

  const nowIso = new Date().toISOString();
  const { data: due } = await svc
    .from('subscriptions')
    .select('id, subscriber_id, provider_id, price_coins, current_period_end')
    .eq('status', 'active')
    .lte('current_period_end', nowIso)
    .order('current_period_end', { ascending: true });

  let renewed = 0;
  let lapsed = 0;

  for (const sub of due ?? []) {
    const oldEnd = sub.current_period_end as string;
    const newEnd = new Date(
      new Date(oldEnd).getTime() + 30 * 24 * 3600 * 1000
    );
    const marker = `${sub.id}:${newEnd.toISOString().slice(0, 10)}`;

    const { error: spendErr } = await svc.rpc('spend_coins', {
      p_user_id: sub.subscriber_id,
      p_amount: sub.price_coins,
      p_kind: 'subscription_charge',
      p_ref: marker,
      p_meta: {},
    });

    if (spendErr) {
      if (!String(spendErr.message).includes('insufficient_balance')) {
        console.error('[cron/subscriptions] charge error', sub.id, spendErr);
        continue;
      }
      // Race guard: only lapse a row that is still active and still
      // on the period we tried to charge for.
      const { data: updated } = await svc
        .from('subscriptions')
        .update({ status: 'lapsed', updated_at: new Date().toISOString() })
        .eq('id', sub.id)
        .eq('status', 'active')
        .eq('current_period_end', oldEnd)
        .select('id')
        .maybeSingle();
      if (!updated) continue;
      await notifyUsers({
        userIds: [sub.subscriber_id as string],
        type: 'system',
        title: 'Fan club subscription lapsed',
        body: 'Your fan club renewal could not be charged because there were not enough coins. You can resubscribe anytime from her profile.',
      }).catch(() => {});
      lapsed++;
      continue;
    }

    // Charge landed. Roll the period forward, guarded the same way so
    // two runs never advance one subscription twice.
    const { data: updated } = await svc
      .from('subscriptions')
      .update({
        current_period_end: newEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.id)
      .eq('status', 'active')
      .eq('current_period_end', oldEnd)
      .select('id')
      .maybeSingle();
    if (!updated) continue;

    const share = Math.floor(
      ((sub.price_coins as number) * (100 - cutPct)) / 100
    );
    if (share > 0) {
      const { error: creditErr } = await svc.rpc('credit_coins', {
        p_user_id: sub.provider_id,
        p_amount: share,
        p_kind: 'subscription_earning',
        p_ref: marker,
        p_meta: {},
      });
      if (creditErr) {
        console.error('[cron/subscriptions] provider credit failed', sub.id, creditErr);
      }
    }
    renewed++;
  }

  return NextResponse.json({ renewed, lapsed });
}
