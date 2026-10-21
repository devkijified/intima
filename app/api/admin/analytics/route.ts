import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/analytics?range=24h|7d|30d|all (default 7d)
 *
 * Full platform analytics for the admin console. Every number is
 * aggregated here from the source tables with the service role, using
 * plain selects and in-code joins only (this schema has almost no
 * foreign keys PostgREST can embed, so embedded selects 400).
 *
 * Definitions that matter:
 * - Connection fee revenue is attributed to the day the fee was PAID
 *   (connections.paid_at), counting fee_state held or released, so a
 *   later refund does not rewrite the day the cash arrived. Refunds
 *   are reported separately under engagement.
 * - Coin topup rails are split from coin_topups by reference prefix,
 *   which is exactly how the three settle paths write them:
 *   "transfer-..." bank transfer, "crypto-..." NOWPayments, anything
 *   else is a Paystack card topup. All three settle paths also insert
 *   into coin_topups, so summing coin_topups alone never double counts.
 * - Gift platform earnings are exact per row:
 *   coin_cost - host_earnings_coins on gift_transactions.
 * - Subscription revenue comes from coin_ledger (kinds
 *   subscription_charge / subscription_earning), which captures both
 *   first charges and cron renewals. Ledger history starts at
 *   migration 036; there is no backfill before it.
 * - Coin-denominated platform earnings are also expressed as an NGN
 *   equivalent at the fixed product rate 1 coin = NGN 10, labelled
 *   as an equivalent wherever it is shown.
 *
 * Deltas compare against the previous equal-length period. For
 * range=all there is no previous period and the prev fields are null.
 *
 * Traffic comes from page_views (migration 056), written by the
 * in-app PageViewBeacon. Unique visitors are a device-based
 * approximation: distinct anon_id among anonymous rows (user_id
 * null) plus distinct user_id among signed-in rows, summed. The
 * errors block groups error_logs messages in code from a bounded
 * pull; the totals still come from the exact head counts.
 */

type RangeKey = '24h' | '7d' | '30d' | 'all';

const PAGE = 1000;
const MAX_PAGES = 50; // 50k rows per pull, hard cap; meta.truncated flags it.
const COIN_NGN = 10;

interface Svc {
  from: (table: string) => any;
}

function svc(): Svc {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as unknown as Svc;
}

async function requireAdmin(): Promise<'anon' | 'forbidden' | 'ok'> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'anon';
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  return profile && ['admin', 'super_admin'].includes(profile.role as string)
    ? 'ok'
    : 'forbidden';
}

/** Page through a table in created_at order, applying a filter fn. */
async function pullAll(
  client: Svc,
  table: string,
  columns: string,
  apply?: (q: any) => any,
  orderColumn = 'created_at'
): Promise<{ rows: any[]; truncated: boolean }> {
  const rows: any[] = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = client
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error || !data) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  return { rows, truncated };
}

async function countWhere(
  client: Svc,
  table: string,
  apply?: (q: any) => any
): Promise<number> {
  let q = client.from(table).select('id', { count: 'exact', head: true });
  if (apply) q = apply(q);
  const { count } = await q;
  return count ?? 0;
}

const t = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) : NaN);

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth === 'anon')
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (auth === 'forbidden')
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const rangeParam = (req.nextUrl.searchParams.get('range') ?? '7d') as RangeKey;
  const range: RangeKey = ['24h', '7d', '30d', 'all'].includes(rangeParam)
    ? rangeParam
    : '7d';

  const now = Date.now();
  const lenMs =
    range === '24h'
      ? 24 * 3600_000
      : range === '7d'
        ? 7 * 24 * 3600_000
        : range === '30d'
          ? 30 * 24 * 3600_000
          : null;
  const start = lenMs === null ? Number.NEGATIVE_INFINITY : now - lenMs;
  const prevStart = lenMs === null ? null : start - lenMs;
  const inCur = (ts: number) => !Number.isNaN(ts) && ts >= start && ts <= now;
  const inPrev = (ts: number) =>
    prevStart !== null && !Number.isNaN(ts) && ts >= prevStart && ts < start;

  const client = svc();
  let truncated = false;
  const note = (r: { rows: any[]; truncated: boolean }) => {
    if (r.truncated) truncated = true;
    return r.rows;
  };

  // ---------------------------------------------------------------
  // Raw pulls (bounded, minimal columns). Windowed tables pull from
  // the previous period start so deltas need no second query.
  // ---------------------------------------------------------------
  const sinceIso =
    prevStart === null || !Number.isFinite(prevStart)
      ? '1970-01-01T00:00:00.000Z'
      : new Date(prevStart).toISOString();
  const since = (col: string) => (q: any) => q.gte(col, sinceIso);

  const [
    profiles,
    presence,
    balances,
    connectionsWindow,
    connectionsAllIds,
    topups,
    gifts,
    ledgerSubs,
    boosts,
    cashouts,
    liveSessions,
    reviewsWindow,
    snaps,
    settings,
    pageViews,
    errorRows,
  ] = await Promise.all([
    pullAll(client, 'profiles', 'id, role, is_verified, display_name, avatar_url, services, rate_short_time_ngn, rate_overnight_ngn, rate_weekend_ngn'),
    pullAll(client, 'provider_presence', 'provider_id, city', undefined, 'provider_id'),
    pullAll(client, 'coin_balances', 'user_id, balance', undefined, 'user_id'),
    pullAll(
      client,
      'connections',
      'id, client_id, provider_id, fee_ngn, status, fee_state, paid_at, dispute_opened_at, created_at',
      (q: any) => q.or(`created_at.gte.${sinceIso},paid_at.gte.${sinceIso}`)
    ),
    pullAll(client, 'connections', 'id, client_id, provider_id, created_at'),
    pullAll(client, 'coin_topups', 'reference, coins, amount_ngn, created_at', since('created_at')),
    pullAll(client, 'gift_transactions', 'sender_id, host_id, session_id, coin_cost, host_earnings_coins, created_at', since('created_at')),
    pullAll(
      client,
      'coin_ledger',
      'user_id, delta, kind, created_at',
      (q: any) => q.gte('created_at', sinceIso).in('kind', ['subscription_charge', 'subscription_earning'])
    ),
    pullAll(client, 'boosts', 'provider_id, coins_spent, created_at', since('created_at')),
    pullAll(client, 'cashout_requests', 'coins, amount_ngn, status, created_at', since('created_at')),
    pullAll(client, 'live_sessions', 'id, provider_id, status, viewer_count, started_at, ended_at, created_at', since('started_at')),
    pullAll(client, 'reviews', 'provider_id, rating, status, created_at', since('created_at')),
    pullAll(client, 'private_snaps', 'provider_id, review_status, reviewed_at, created_at'),
    pullAll(client, 'platform_settings', 'key, value', undefined, 'key'),
    pullAll(client, 'page_views', 'path, referrer_host, user_id, anon_id, created_at', since('created_at')),
    pullAll(client, 'error_logs', 'message, created_at', since('created_at')),
  ]).then((rs) => rs.map(note));

  // Counts that are cheaper exact than pulled.
  const [
    messagesCur,
    messagesPrev,
    storiesCur,
    storiesPrev,
    errorsCur,
    errorsPrev,
    openReports,
    pendingVerifications,
    openDisputes,
    pendingCashoutsCount,
    subsNewCur,
    subsActive,
    cardPaid,
    cardPending,
    cardFailed,
    cryptoFinished,
    cryptoPending,
    cryptoFailed,
  ] = await Promise.all([
    countWhere(client, 'messages', (q) => q.gte('created_at', new Date(start === Number.NEGATIVE_INFINITY ? 0 : start).toISOString())),
    prevStart === null ? Promise.resolve(null) : countWhere(client, 'messages', (q) => q.gte('created_at', new Date(prevStart).toISOString()).lt('created_at', new Date(start).toISOString())),
    countWhere(client, 'stories', (q) => q.gte('created_at', new Date(start === Number.NEGATIVE_INFINITY ? 0 : start).toISOString())),
    prevStart === null ? Promise.resolve(null) : countWhere(client, 'stories', (q) => q.gte('created_at', new Date(prevStart).toISOString()).lt('created_at', new Date(start).toISOString())),
    countWhere(client, 'error_logs', (q) => q.gte('created_at', new Date(start === Number.NEGATIVE_INFINITY ? 0 : start).toISOString())),
    prevStart === null ? Promise.resolve(null) : countWhere(client, 'error_logs', (q) => q.gte('created_at', new Date(prevStart).toISOString()).lt('created_at', new Date(start).toISOString())),
    countWhere(client, 'reports', (q) => q.eq('status', 'open')),
    countWhere(client, 'verifications', (q) => q.eq('status', 'pending')),
    countWhere(client, 'connections', (q) => q.eq('fee_state', 'disputed')),
    countWhere(client, 'cashout_requests', (q) => q.eq('status', 'pending')),
    countWhere(client, 'subscriptions', (q) => q.gte('created_at', new Date(start === Number.NEGATIVE_INFINITY ? 0 : start).toISOString())),
    countWhere(client, 'subscriptions', (q) => q.eq('status', 'active')),
    countWhere(client, 'card_payments', (q) => q.eq('status', 'paid').gte('created_at', sinceIso)),
    countWhere(client, 'card_payments', (q) => q.eq('status', 'pending').gte('created_at', sinceIso)),
    countWhere(client, 'card_payments', (q) => q.eq('status', 'failed').gte('created_at', sinceIso)),
    countWhere(client, 'crypto_payments', (q) => q.eq('status', 'finished').gte('created_at', sinceIso)),
    countWhere(client, 'crypto_payments', (q) => q.eq('status', 'pending').gte('created_at', sinceIso)),
    countWhere(client, 'crypto_payments', (q) => q.in('status', ['failed', 'expired']).gte('created_at', sinceIso)),
  ]);

  const settingNum = (key: string, fallback: number): number => {
    const row = settings.find((s) => s.key === key);
    const v = row?.value;
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) ? n : fallback;
  };
  const giftCutPct = settingNum('gift_platform_cut_pct', 50);

  const nameOf = new Map<string, string>();
  for (const p of profiles) nameOf.set(p.id, p.display_name || 'Unnamed');
  const cityOf = new Map<string, string>();
  for (const p of presence) cityOf.set(p.provider_id, p.city);

  // ---------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------
  const models = profiles.filter((p) => p.role === 'model');
  const setupComplete = (p: any): boolean =>
    !!p.display_name &&
    !!p.avatar_url &&
    cityOf.has(p.id) &&
    (p.rate_short_time_ngn != null || p.rate_overnight_ngn != null || p.rate_weekend_ngn != null) &&
    Array.isArray(p.services) &&
    p.services.length > 0;
  const users = {
    total: profiles.length,
    clients: profiles.filter((p) => p.role === 'client').length,
    companions: models.length,
    admins: profiles.filter((p) => p.role === 'admin' || p.role === 'super_admin').length,
    newSignups: profiles.filter((p) => inCur(t(p.created_at))).length,
    prevNewSignups:
      prevStart === null ? null : profiles.filter((p) => inPrev(t(p.created_at))).length,
    verifiedCompanions: models.filter((p) => p.is_verified).length,
    companionsSetupComplete: models.filter(setupComplete).length,
  };

  // ---------------------------------------------------------------
  // Revenue
  // ---------------------------------------------------------------
  const feeRowsCur = connectionsWindow.filter(
    (c) => c.paid_at && inCur(t(c.paid_at)) && (c.fee_state === 'held' || c.fee_state === 'released')
  );
  const feeRowsPrev = connectionsWindow.filter(
    (c) => c.paid_at && inPrev(t(c.paid_at)) && (c.fee_state === 'held' || c.fee_state === 'released')
  );
  const connectionFeesNgn = feeRowsCur.reduce((s, c) => s + (c.fee_ngn || 0), 0);
  const prevConnectionFeesNgn =
    prevStart === null ? null : feeRowsPrev.reduce((s, c) => s + (c.fee_ngn || 0), 0);

  const railOf = (ref: string): 'card' | 'transfer' | 'crypto' =>
    ref.startsWith('transfer-') ? 'transfer' : ref.startsWith('crypto-') ? 'crypto' : 'card';
  const railBucket = () => ({ ngn: 0, coins: 0, count: 0 });
  const topupRails = { card: railBucket(), transfer: railBucket(), crypto: railBucket() };
  let prevTopupsNgn: number | null = prevStart === null ? null : 0;
  for (const row of topups) {
    const ts = t(row.created_at);
    if (inCur(ts)) {
      const b = topupRails[railOf(String(row.reference ?? ''))];
      b.ngn += row.amount_ngn || 0;
      b.coins += row.coins || 0;
      b.count += 1;
    } else if (inPrev(ts) && prevTopupsNgn !== null) {
      prevTopupsNgn += row.amount_ngn || 0;
    }
  }
  const topupsTotal = {
    ngn: topupRails.card.ngn + topupRails.transfer.ngn + topupRails.crypto.ngn,
    coins: topupRails.card.coins + topupRails.transfer.coins + topupRails.crypto.coins,
  };

  const giftAgg = (rows: any[]) => ({
    volumeCoins: rows.reduce((s, g) => s + (g.coin_cost || 0), 0),
    hostEarningsCoins: rows.reduce((s, g) => s + (g.host_earnings_coins || 0), 0),
    count: rows.length,
  });
  const giftsCur = giftAgg(gifts.filter((g) => inCur(t(g.created_at))));
  const giftsPrev = prevStart === null ? null : giftAgg(gifts.filter((g) => inPrev(t(g.created_at))));
  const giftPlatformCoins = giftsCur.volumeCoins - giftsCur.hostEarningsCoins;

  const subChargesCur = ledgerSubs.filter((r) => r.kind === 'subscription_charge' && inCur(t(r.created_at)));
  const subEarningsCur = ledgerSubs.filter((r) => r.kind === 'subscription_earning' && inCur(t(r.created_at)));
  const subChargesPrev =
    prevStart === null ? null : ledgerSubs.filter((r) => r.kind === 'subscription_charge' && inPrev(t(r.created_at)));
  const subEarningsPrev =
    prevStart === null ? null : ledgerSubs.filter((r) => r.kind === 'subscription_earning' && inPrev(t(r.created_at)));
  const subGrossCoins = subChargesCur.reduce((s, r) => s + Math.abs(r.delta || 0), 0);
  const subProviderCoins = subEarningsCur.reduce((s, r) => s + (r.delta || 0), 0);
  const subPlatformCoins = subGrossCoins - subProviderCoins;
  const prevSubPlatformCoins =
    subChargesPrev === null || subEarningsPrev === null
      ? null
      : subChargesPrev.reduce((s, r) => s + Math.abs(r.delta || 0), 0) -
        subEarningsPrev.reduce((s, r) => s + (r.delta || 0), 0);

  const boostsCur = boosts.filter((b) => inCur(t(b.created_at)));
  const boostCoins = boostsCur.reduce((s, b) => s + (b.coins_spent || 0), 0);

  const cashAgg = (rows: any[], status: string) => {
    const rs = rows.filter((r) => r.status === status);
    return {
      count: rs.length,
      coins: rs.reduce((s, r) => s + (r.coins || 0), 0),
      ngn: rs.reduce((s, r) => s + (r.amount_ngn || 0), 0),
    };
  };
  const cashCur = cashouts.filter((c) => inCur(t(c.created_at)));
  const liabilityCoins = balances.reduce((s, b) => s + (b.balance || 0), 0);

  const revenue = {
    totalCashInNgn: connectionFeesNgn + topupsTotal.ngn,
    prevTotalCashInNgn:
      prevConnectionFeesNgn === null || prevTopupsNgn === null
        ? null
        : prevConnectionFeesNgn + prevTopupsNgn,
    connectionFeesNgn,
    prevConnectionFeesNgn,
    topups: { total: topupsTotal, ...topupRails },
    prevTopupsNgn,
    gifts: {
      volumeCoins: giftsCur.volumeCoins,
      hostEarningsCoins: giftsCur.hostEarningsCoins,
      platformCoins: giftPlatformCoins,
      platformNgnEq: giftPlatformCoins * COIN_NGN,
      count: giftsCur.count,
      cutPct: giftCutPct,
    },
    prevGiftPlatformCoins:
      giftsPrev === null ? null : giftsPrev.volumeCoins - giftsPrev.hostEarningsCoins,
    subscriptions: {
      newCount: subsNewCur,
      activeCount: subsActive,
      grossCoins: subGrossCoins,
      providerCoins: subProviderCoins,
      platformCoins: subPlatformCoins,
      platformNgnEq: subPlatformCoins * COIN_NGN,
    },
    prevSubscriptionPlatformCoins: prevSubPlatformCoins,
    boosts: { count: boostsCur.length, coins: boostCoins, ngnEq: boostCoins * COIN_NGN },
    cashouts: {
      requested: cashAgg(cashCur, 'pending'),
      approved: cashAgg(cashCur, 'approved'),
      paid: cashAgg(cashCur, 'paid'),
      rejected: cashAgg(cashCur, 'rejected'),
      requestedAll: {
        count: cashCur.length,
        coins: cashCur.reduce((s, r) => s + (r.coins || 0), 0),
        ngn: cashCur.reduce((s, r) => s + (r.amount_ngn || 0), 0),
      },
    },
    liability: { coins: liabilityCoins, ngnEq: liabilityCoins * COIN_NGN },
  };

  // ---------------------------------------------------------------
  // Engagement
  // ---------------------------------------------------------------
  const connCur = connectionsWindow.filter((c) => inCur(t(c.created_at)));
  const connPrev =
    prevStart === null ? null : connectionsWindow.filter((c) => inPrev(t(c.created_at)));
  const paidCur = connCur.filter((c) => c.paid_at);
  const disputedCur = connectionsWindow.filter((c) =>
    inCur(t(c.dispute_opened_at ?? c.created_at)) && (c.fee_state === 'disputed' || c.dispute_opened_at)
  );
  const refundedCur = connCur.filter((c) => c.fee_state === 'refunded' || c.status === 'refunded');
  const releasedCur = connCur.filter((c) => c.fee_state === 'released');
  const resolvedCount = releasedCur.length + refundedCur.length;
  const engagementConnections = {
    created: connCur.length,
    prevCreated: connPrev === null ? null : connPrev.length,
    paid: paidCur.length,
    disputed: disputedCur.length,
    refunded: refundedCur.length,
    released: releasedCur.length,
    paidRatePct: connCur.length ? Math.round((paidCur.length / connCur.length) * 1000) / 10 : null,
    completionRatePct: resolvedCount
      ? Math.round((releasedCur.length / resolvedCount) * 1000) / 10
      : null,
  };

  const reviewsCur = reviewsWindow.filter((r) => inCur(t(r.created_at)) && r.status === 'published');
  const reviewsPrev =
    prevStart === null
      ? null
      : reviewsWindow.filter((r) => inPrev(t(r.created_at)) && r.status === 'published');
  const avgRating = reviewsCur.length
    ? Math.round((reviewsCur.reduce((s, r) => s + (r.rating || 0), 0) / reviewsCur.length) * 10) / 10
    : null;

  const liveCur = liveSessions.filter(
    (s) => inCur(t(s.started_at)) && ['live', 'ended', 'suspended'].includes(s.status)
  );
  const livePrev =
    prevStart === null
      ? null
      : liveSessions.filter(
          (s) => inPrev(t(s.started_at)) && ['live', 'ended', 'suspended'].includes(s.status)
        );
  const minutesOf = (rows: any[]) =>
    Math.round(
      rows.reduce((s, r) => {
        const begin = t(r.started_at);
        const end = r.ended_at ? t(r.ended_at) : now;
        return s + Math.max(0, (end - begin) / 60000);
      }, 0)
    );
  const giftSessionIds = new Set(gifts.filter((g) => inCur(t(g.created_at))).map((g) => g.session_id));
  const snapsApproved = snaps.filter((s) => s.review_status === 'approved');
  const snapsApprovedInRange = snapsApproved.filter((s) =>
    inCur(t(s.reviewed_at ?? s.created_at))
  );

  const engagement = {
    connections: engagementConnections,
    reviews: {
      count: reviewsCur.length,
      prevCount: reviewsPrev === null ? null : reviewsPrev.length,
      averageRating: avgRating,
    },
    messages: { sent: messagesCur, prevSent: messagesPrev },
    stories: { posted: storiesCur, prevPosted: storiesPrev },
    live: {
      sessions: liveCur.length,
      prevSessions: livePrev === null ? null : livePrev.length,
      minutes: minutesOf(liveCur),
      prevMinutes: livePrev === null ? null : minutesOf(livePrev),
      peakViewers: liveCur.reduce((m, s) => Math.max(m, s.viewer_count || 0), 0),
      giftsPerSession: liveCur.length
        ? Math.round((giftsCur.count / liveCur.length) * 10) / 10
        : null,
      sessionsWithGifts: giftSessionIds.size,
      scheduledNow: liveSessions.filter((s) => s.status === 'scheduled').length,
    },
    fansOnly: {
      approvedInRange: snapsApprovedInRange.length,
      approvedTotal: snapsApproved.length,
      pendingReview: snaps.filter((s) => s.review_status === 'pending').length,
    },
  };

  // ---------------------------------------------------------------
  // Funnel (cohort: accounts created inside the current window)
  // ---------------------------------------------------------------
  const cohortClients = profiles.filter((p) => p.role === 'client' && inCur(t(p.created_at)));
  const cohortModels = models.filter((p) => inCur(t(p.created_at)));
  const clientsWithConnection = new Set(connectionsAllIds.map((c) => c.client_id));
  const pct = (n: number, d: number): number | null =>
    d > 0 ? Math.round((n / d) * 1000) / 10 : null;
  const funnel = {
    clients: {
      signups: cohortClients.length,
      profileCompleted: cohortClients.filter((p) => !!p.display_name).length,
      firstConnection: cohortClients.filter((p) => clientsWithConnection.has(p.id)).length,
      pctProfile: 0,
      pctConnection: 0,
    },
    companions: {
      signups: cohortModels.length,
      setupCompleted: cohortModels.filter(setupComplete).length,
      verified: cohortModels.filter((p) => p.is_verified).length,
      pctSetup: 0,
      pctVerified: 0,
    },
  };
  funnel.clients.pctProfile = pct(funnel.clients.profileCompleted, funnel.clients.signups) ?? 0;
  funnel.clients.pctConnection = pct(funnel.clients.firstConnection, funnel.clients.signups) ?? 0;
  funnel.companions.pctSetup = pct(funnel.companions.setupCompleted, funnel.companions.signups) ?? 0;
  funnel.companions.pctVerified = pct(funnel.companions.verified, funnel.companions.signups) ?? 0;

  // ---------------------------------------------------------------
  // Rankings (current window)
  // ---------------------------------------------------------------
  const top5 = <T,>(entries: [string, T][]): [string, T][] =>
    entries.sort((a, b) => (b[1] as any) - (a[1] as any)).slice(0, 5) as [string, T][];

  const feeByProvider = new Map<string, { ngn: number; connections: number }>();
  for (const c of feeRowsCur) {
    const e = feeByProvider.get(c.provider_id) ?? { ngn: 0, connections: 0 };
    e.ngn += c.fee_ngn || 0;
    e.connections += 1;
    feeByProvider.set(c.provider_id, e);
  }
  const giftByHost = new Map<string, { coins: number; grossCoins: number }>();
  for (const g of gifts.filter((x) => inCur(t(x.created_at)))) {
    const e = giftByHost.get(g.host_id) ?? { coins: 0, grossCoins: 0 };
    e.coins += g.host_earnings_coins || 0;
    e.grossCoins += g.coin_cost || 0;
    giftByHost.set(g.host_id, e);
  }
  const spendByGifter = new Map<string, number>();
  for (const g of gifts.filter((x) => inCur(t(x.created_at)))) {
    spendByGifter.set(g.sender_id, (spendByGifter.get(g.sender_id) ?? 0) + (g.coin_cost || 0));
  }
  const cityCounts = new Map<string, number>();
  for (const p of presence) cityCounts.set(p.city, (cityCounts.get(p.city) ?? 0) + 1);

  const rankings = {
    companionsByFeeRevenue: [...feeByProvider.entries()]
      .sort((a, b) => b[1].ngn - a[1].ngn)
      .slice(0, 5)
      .map(([id, v]) => ({ id, name: nameOf.get(id) ?? 'Unnamed', ngn: v.ngn, connections: v.connections })),
    companionsByGiftEarnings: [...giftByHost.entries()]
      .sort((a, b) => b[1].coins - a[1].coins)
      .slice(0, 5)
      .map(([id, v]) => ({ id, name: nameOf.get(id) ?? 'Unnamed', coins: v.coins, grossCoins: v.grossCoins })),
    gifters: [...spendByGifter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, coins]) => ({ id, name: nameOf.get(id) ?? 'Unnamed', coins })),
    companionsByCity: [...cityCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([city, count]) => ({ city, count })),
  };
  void top5;

  // ---------------------------------------------------------------
  // Ops health (current snapshot; errors and payments windowed)
  // ---------------------------------------------------------------
  const scheduledCount = await countWhere(client, 'live_sessions', (q) => q.eq('status', 'scheduled'));
  engagement.live.scheduledNow = scheduledCount;
  const ops = {
    openReports,
    pendingVerifications,
    openDisputes,
    errorsInRange: errorsCur,
    prevErrorsInRange: errorsPrev,
    pendingCashouts: pendingCashoutsCount,
    pendingSnaps: engagement.fansOnly.pendingReview,
    cardPayments: { paid: cardPaid, pending: cardPending, failed: cardFailed },
    cryptoPayments: { finished: cryptoFinished, pending: cryptoPending, failedOrExpired: cryptoFailed },
  };

  // ---------------------------------------------------------------
  // Series: hourly buckets for 24h, daily for 7d/30d, weekly for all
  // ---------------------------------------------------------------
  const bucketMs =
    range === '24h' ? 3600_000 : range === 'all' ? 7 * 24 * 3600_000 : 24 * 3600_000;
  let seriesStart: number;
  if (range === 'all') {
    const earliest = profiles.reduce((m, p) => Math.min(m, t(p.created_at) || now), now);
    seriesStart = Math.floor(earliest / bucketMs) * bucketMs;
  } else {
    seriesStart = Math.floor(start / bucketMs) * bucketMs;
  }
  const bucketCount = Math.min(Math.floor((now - seriesStart) / bucketMs) + 1, 400);
  const series = Array.from({ length: bucketCount }, (_, i) => {
    const bStart = seriesStart + i * bucketMs;
    const d = new Date(bStart);
    const label =
      range === '24h'
        ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : range === 'all'
          ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
    return { bucketStart: new Date(bStart).toISOString(), label, signups: 0, revenueNgn: 0, connections: 0, visits: 0 };
  });
  const bucketIdx = (ts: number) => Math.floor((ts - seriesStart) / bucketMs);
  const addTo = (ts: number, fn: (b: (typeof series)[number]) => void) => {
    const i = bucketIdx(ts);
    if (i >= 0 && i < series.length) fn(series[i]);
  };
  for (const p of profiles) addTo(t(p.created_at), (b) => { b.signups += 1; });
  for (const c of connectionsWindow) {
    if (c.paid_at) addTo(t(c.paid_at), (b) => { b.revenueNgn += c.fee_state === 'refunded' ? 0 : c.fee_ngn || 0; });
    addTo(t(c.created_at), (b) => { b.connections += 1; });
  }
  for (const row of topups) addTo(t(row.created_at), (b) => { b.revenueNgn += row.amount_ngn || 0; });
  for (const v of pageViews) addTo(t(v.created_at), (b) => { b.visits += 1; });

  // ---------------------------------------------------------------
  // Traffic (page_views) and error detail (error_logs)
  // ---------------------------------------------------------------
  const pvCur = pageViews.filter((v) => inCur(t(v.created_at)));
  const pvPrev =
    prevStart === null ? null : pageViews.filter((v) => inPrev(t(v.created_at)));
  const uniqueVisitorsOf = (rows: any[]): number => {
    const users = new Set<string>();
    const devices = new Set<string>();
    for (const r of rows) {
      if (r.user_id) users.add(r.user_id as string);
      else if (r.anon_id) devices.add(r.anon_id as string);
    }
    return users.size + devices.size;
  };
  const topCounts = (
    rows: any[],
    key: string,
    exclude?: (v: string) => boolean
  ): { value: string; views: number }[] => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const v = r[key];
      if (typeof v !== 'string' || v.length === 0) continue;
      if (exclude && exclude(v)) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, views]) => ({ value, views }));
  };
  const selfHost = req.nextUrl.hostname;
  const traffic = {
    pageviews: pvCur.length,
    prevPageviews: pvPrev === null ? null : pvPrev.length,
    uniqueVisitors: uniqueVisitorsOf(pvCur),
    prevUniqueVisitors: pvPrev === null ? null : uniqueVisitorsOf(pvPrev),
    activeUsers: new Set(
      pvCur.map((v) => v.user_id).filter((x): x is string => typeof x === 'string')
    ).size,
    topPages: topCounts(pvCur, 'path').map((r) => ({ path: r.value, views: r.views })),
    topReferrers: topCounts(pvCur, 'referrer_host', (h) => h === selfHost).map(
      (r) => ({ host: r.value, views: r.views })
    ),
  };

  const errCounts = new Map<string, number>();
  for (const e of errorRows) {
    if (!inCur(t(e.created_at))) continue;
    const msg = typeof e.message === 'string' ? e.message : '';
    if (!msg) continue;
    errCounts.set(msg, (errCounts.get(msg) ?? 0) + 1);
  }
  const errors = {
    totalInRange: errorsCur,
    prevTotalInRange: errorsPrev,
    top: [...errCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([message, count]) => ({ message, count })),
  };

  return NextResponse.json({
    range,
    generatedAt: new Date(now).toISOString(),
    windowStart: range === 'all' ? null : new Date(start).toISOString(),
    windowEnd: new Date(now).toISOString(),
    previousWindowStart: prevStart === null ? null : new Date(prevStart).toISOString(),
    meta: { truncated },
    users,
    revenue,
    engagement,
    funnel,
    rankings,
    ops,
    traffic,
    errors,
    series,
  });
}
