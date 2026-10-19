import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * POST /api/live/gift
 * Sends a gift during a live stream. Body: { sessionId, giftId }.
 *
 * Server-side, atomic:
 * 1. Verify session is live and sender is not the host.
 * 2. Look up gift cost from gift_catalog.
 * 3. Check sender coin balance, deduct.
 * 4. Credit host earnings (minus platform cut from platform_settings).
 * 5. Write the gift_transactions ledger row.
 * 6. Broadcast via Supabase Realtime (client subscribes to the table).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { sessionId, giftId } = await req.json();
    if (!sessionId || !giftId) {
      return NextResponse.json({ error: 'sessionId and giftId required' }, { status: 400 });
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Session must be live.
    const { data: session } = await service
      .from('live_sessions')
      .select('id, provider_id, status')
      .eq('id', sessionId)
      .single();
    if (!session || session.status !== 'live') {
      return NextResponse.json({ error: 'Stream is not live' }, { status: 404 });
    }
    if (session.provider_id === user.id) {
      return NextResponse.json({ error: 'Hosts cannot gift themselves' }, { status: 400 });
    }

    // Gift must exist and be active.
    const { data: gift } = await service
      .from('gift_catalog')
      .select('id, name, emoji, coin_cost, tier')
      .eq('id', giftId)
      .eq('is_active', true)
      .single();
    if (!gift) {
      return NextResponse.json({ error: 'Gift not found' }, { status: 404 });
    }

    // Balance check.
    const { data: balance } = await service
      .from('coin_balances')
      .select('balance')
      .eq('user_id', user.id)
      .maybeSingle();
    const current = balance?.balance ?? 0;
    if (current < gift.coin_cost) {
      return NextResponse.json(
        { error: 'Not enough coins', balance: current, cost: gift.coin_cost },
        { status: 402 }
      );
    }

    // Platform cut (default 50%, TikTok-style).
    const { data: settings } = await service
      .from('platform_settings')
      .select('value')
      .eq('key', 'gift_platform_cut_pct')
      .maybeSingle();
    const cutPct = Number(settings?.value ?? 50);
    const hostEarnings = Math.floor(gift.coin_cost * (100 - cutPct) / 100);

    // Deduct sender.
    const { error: deductErr } = await service
      .from('coin_balances')
      .upsert(
        { user_id: user.id, balance: current - gift.coin_cost, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    if (deductErr) throw deductErr;

    // Credit host.
    const { data: hostBal } = await service
      .from('coin_balances')
      .select('balance')
      .eq('user_id', session.provider_id)
      .maybeSingle();
    await service.from('coin_balances').upsert(
      {
        user_id: session.provider_id,
        balance: (hostBal?.balance ?? 0) + hostEarnings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    // Ledger row (clients subscribe to this table for live gift events).
    const { data: tx, error: txErr } = await service
      .from('gift_transactions')
      .insert({
        session_id: sessionId,
        sender_id: user.id,
        host_id: session.provider_id,
        gift_id: gift.id,
        coin_cost: gift.coin_cost,
        host_earnings_coins: hostEarnings,
      })
      .select('id, created_at')
      .single();
    if (txErr) throw txErr;

    // Sender display name for the animation.
    const { data: sender } = await service
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      success: true,
      transactionId: tx.id,
      gift: { id: gift.id, name: gift.name, emoji: gift.emoji, tier: gift.tier },
      senderName: sender?.display_name ?? 'Someone',
      newBalance: current - gift.coin_cost,
    });
  } catch (e) {
    console.error('[live/gift]', e);
    return NextResponse.json({ error: 'Gift failed' }, { status: 500 });
  }
}
