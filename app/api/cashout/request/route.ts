import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/cashout/request
 * Companion requests a cash-out: coins are deducted immediately and held
 * in the request. Refunded if admin rejects.
 * Body: { coins, bankName, accountNumber, accountName }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    // Only companions can cash out.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'model') {
      return NextResponse.json({ error: 'Only companions can cash out' }, { status: 403 });
    }

    const { coins, bankName, accountNumber, accountName } = await req.json();
    const coinAmount = Math.floor(Number(coins));
    if (!Number.isFinite(coinAmount) || coinAmount <= 0) {
      return NextResponse.json({ error: 'Invalid coin amount' }, { status: 400 });
    }
    if (!bankName?.trim() || !accountNumber?.trim() || !accountName?.trim()) {
      return NextResponse.json({ error: 'Bank details required' }, { status: 400 });
    }
    if (!/^\d{10}$/.test(accountNumber.trim())) {
      return NextResponse.json({ error: 'Account number must be 10 digits' }, { status: 400 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Minimum from platform settings.
    const { data: setting } = await service
      .from('platform_settings')
      .select('value')
      .eq('key', 'cashout_min_coins')
      .maybeSingle();
    const minCoins = Number(setting?.value ?? 500);
    if (coinAmount < minCoins) {
      return NextResponse.json(
        { error: `Minimum cash-out is ${minCoins.toLocaleString()} coins` },
        { status: 400 }
      );
    }

    // Atomic deduct: one statement, balance-checked in the database, so
    // concurrent requests cannot double-spend. Create the request AFTER,
    // so a failed insert never burns coins.
    const { error: spendErr } = await service.rpc('spend_coins', {
      p_user_id: user.id,
      p_amount: coinAmount,
      p_kind: 'cashout_request',
      p_ref: null,
      p_meta: {},
    });
    if (spendErr) {
      if (String(spendErr.message).includes('insufficient_balance')) {
        return NextResponse.json({ error: 'Not enough coins' }, { status: 400 });
      }
      throw spendErr;
    }

    const { data: request, error } = await service
      .from('cashout_requests')
      .insert({
        user_id: user.id,
        coins: coinAmount,
        amount_ngn: coinAmount * 10, // 1 coin = ₦10
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        account_name: accountName.trim(),
        status: 'pending',
      })
      .select('id, coins, amount_ngn, status, created_at')
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, request });
  } catch (e) {
    console.error('[cashout/request]', e);
    return NextResponse.json({ error: 'Cash-out request failed' }, { status: 500 });
  }
}

/**
 * GET /api/cashout/mine: companion's cash-out history.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { data } = await supabase
    .from('cashout_requests')
    .select('id, coins, amount_ngn, status, created_at, processed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ requests: data ?? [] });
}
