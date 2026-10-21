import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notifyUsers } from '@/lib/push-server';
import { getSnapStanding, snapBlockCopy } from '@/lib/snaps/rules';

/**
 * Fan club subscriptions.
 *
 * GET  /api/subscriptions?provider_id=: the fan club price for that
 *      provider plus the viewer's own subscription state with her.
 * POST /api/subscriptions { provider_id }: subscribe. The subscriber
 *      is charged in coins via spend_coins (kind
 *      'subscription_charge'); the provider is credited her share via
 *      credit_coins (kind 'subscription_earning'). The split comes
 *      from the platform_settings key
 *      'subscription_platform_cut_pct' and is never hardcoded; 50 is
 *      only the fallback when the settings row is missing.
 *
 * A subscription is effective while status is 'active', or while it
 * is 'cancelled' with current_period_end still in the future
 * (perks run to the end of the paid period).
 */

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface SubRow {
  id: string;
  status: string;
  current_period_end: string;
  created_at: string;
}

function isEffective(row: SubRow, now: Date): boolean {
  if (row.status === 'active') return true;
  if (row.status === 'cancelled') {
    return new Date(row.current_period_end).getTime() > now.getTime();
  }
  return false;
}

async function getCutPct(svc: ReturnType<typeof service>): Promise<number> {
  const { data } = await svc
    .from('platform_settings')
    .select('value')
    .eq('key', 'subscription_platform_cut_pct')
    .maybeSingle();
  // The value column is JSON, so the row reads back as the number 50,
  // but tolerate a string form too. Fall back to 50 only when the row
  // is missing or unreadable.
  const raw = data?.value as unknown;
  const n =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 50;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const providerId = req.nextUrl.searchParams.get('provider_id');
    if (!providerId) {
      return NextResponse.json({ error: 'provider_id required' }, { status: 400 });
    }

    const svc = service();
    const { data: provider } = await svc
      .from('profiles')
      .select('sub_price_coins')
      .eq('id', providerId)
      .maybeSingle();
    const priceCoins =
      typeof provider?.sub_price_coins === 'number' && provider.sub_price_coins > 0
        ? provider.sub_price_coins
        : null;

    const { data: rows } = await svc
      .from('subscriptions')
      .select('id, status, current_period_end, created_at')
      .eq('subscriber_id', user.id)
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .limit(5);
    const now = new Date();
    const effective = ((rows ?? []) as SubRow[]).find((r) => isEffective(r, now));

    return NextResponse.json({
      priceCoins,
      subscription: effective
        ? {
            status: 'active',
            cancelled: effective.status === 'cancelled',
            current_period_end: effective.current_period_end,
          }
        : null,
    });
  } catch (e) {
    console.error('[subscriptions GET]', e);
    return NextResponse.json({ error: 'Could not load fan club' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { provider_id: providerId } = await req.json().catch(() => ({}));
    if (!providerId || typeof providerId !== 'string') {
      return NextResponse.json({ error: 'provider_id required' }, { status: 400 });
    }
    if (providerId === user.id) {
      return NextResponse.json(
        { error: 'You cannot subscribe to your own fan club' },
        { status: 400 }
      );
    }

    const svc = service();
    const { data: provider } = await svc
      .from('profiles')
      .select('id, sub_price_coins, display_name')
      .eq('id', providerId)
      .maybeSingle();
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }
    const price = provider.sub_price_coins as number | null;
    if (!price || price <= 0) {
      return NextResponse.json({ error: 'This fan club is not open' }, { status: 400 });
    }

    // Earning gate (Private Snaps rules): a fan club only takes new
    // subscriptions while the creator is verified, has enough
    // reviewed content live, and the gallery is fresh. Existing
    // members are untouched; this guards new money only.
    const standing = await getSnapStanding(svc, providerId);
    if (!standing.canEarn) {
      return NextResponse.json(
        {
          error: snapBlockCopy(
            standing.blockedBy,
            (provider.display_name as string | null) ?? 'This creator'
          ),
        },
        { status: 403 }
      );
    }

    // One effective subscription per pair.
    const { data: existing } = await svc
      .from('subscriptions')
      .select('id, status, current_period_end, created_at')
      .eq('subscriber_id', user.id)
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .limit(5);
    const now = new Date();
    if (((existing ?? []) as SubRow[]).some((r) => isEffective(r, now))) {
      return NextResponse.json(
        { error: 'You are already in this fan club' },
        { status: 409 }
      );
    }

    // Insert the row first so the ledger refs can carry its id. If the
    // charge fails, the row is deleted again below.
    const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    const { data: sub, error: insErr } = await svc
      .from('subscriptions')
      .insert({
        subscriber_id: user.id,
        provider_id: providerId,
        price_coins: price,
        status: 'active',
        current_period_end: periodEnd.toISOString(),
      })
      .select('id, current_period_end')
      .single();
    if (insErr) {
      if ((insErr as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'You are already in this fan club' },
          { status: 409 }
        );
      }
      throw insErr;
    }

    const { error: spendErr } = await svc.rpc('spend_coins', {
      p_user_id: user.id,
      p_amount: price,
      p_kind: 'subscription_charge',
      p_ref: sub.id,
      p_meta: {},
    });
    if (spendErr) {
      await svc.from('subscriptions').delete().eq('id', sub.id);
      if (String(spendErr.message).includes('insufficient_balance')) {
        return NextResponse.json({ error: 'Not enough coins' }, { status: 402 });
      }
      throw spendErr;
    }

    // Provider share after the platform cut from platform_settings.
    const cutPct = await getCutPct(svc);
    const share = Math.floor((price * (100 - cutPct)) / 100);
    if (share > 0) {
      const { error: creditErr } = await svc.rpc('credit_coins', {
        p_user_id: providerId,
        p_amount: share,
        p_kind: 'subscription_earning',
        p_ref: sub.id,
        p_meta: {},
      });
      if (creditErr) {
        // credit_coins is idempotent on (kind, ref), so a retry can
        // settle this later. The fan has paid and keeps access.
        console.error('[subscriptions POST] provider credit failed', creditErr);
      }
    }

    const { data: subscriber } = await svc
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    await notifyUsers({
      userIds: [providerId],
      type: 'subscription_started',
      title: 'New fan club member',
      body: `${subscriber?.display_name ?? 'Someone'} joined your fan club.`,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      subscription: {
        id: sub.id,
        status: 'active',
        cancelled: false,
        current_period_end: sub.current_period_end,
      },
      priceCoins: price,
    });
  } catch (e) {
    console.error('[subscriptions POST]', e);
    return NextResponse.json({ error: 'Subscribe failed' }, { status: 500 });
  }
}
