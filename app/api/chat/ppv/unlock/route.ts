import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * POST /api/chat/ppv/unlock — spend coins to unlock a PPV message.
 * Body: { messageId }.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { messageId } = await req.json().catch(() => ({}));
  if (typeof messageId !== 'string' || !messageId) {
    return NextResponse.json({ error: 'messageId required' }, { status: 400 });
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: msg } = await svc
    .from('messages')
    .select('id, connection_id, sender_id, ppv_price_coins, unlocked_by, media_url, media_type')
    .eq('id', messageId)
    .single();
  if (!msg || !msg.ppv_price_coins || msg.ppv_price_coins <= 0) {
    return NextResponse.json({ error: 'Not a locked message' }, { status: 404 });
  }
  if (msg.sender_id === user.id) {
    return NextResponse.json({ error: 'Cannot unlock your own message' }, { status: 400 });
  }
  if ((msg.unlocked_by ?? []).includes(user.id)) {
    return NextResponse.json({ success: true, alreadyUnlocked: true });
  }

  // Viewer must be in the connection.
  const { data: conn } = await svc
    .from('connections')
    .select('id, client_id, provider_id')
    .eq('id', msg.connection_id)
    .single();
  if (!conn || (conn.client_id !== user.id && conn.provider_id !== user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Atomic spend.
  const { error: spendErr } = await svc.rpc('spend_coins', {
    p_user_id: user.id,
    p_amount: msg.ppv_price_coins,
  });
  if (spendErr) {
    if (String(spendErr.message).includes('insufficient_balance')) {
      return NextResponse.json({ error: 'Not enough coins', cost: msg.ppv_price_coins }, { status: 402 });
    }
    throw spendErr;
  }

  // Host cut from platform_settings (same as gifts).
  const { data: settings } = await svc
    .from('platform_settings')
    .select('value')
    .eq('key', 'gift_platform_cut_pct')
    .maybeSingle();
  const cutPct = Number(settings?.value ?? 50);
  const hostEarnings = Math.floor(msg.ppv_price_coins * (100 - cutPct) / 100);

  const { data: hostBal } = await svc.from('coin_balances')
    .select('balance').eq('user_id', msg.sender_id).maybeSingle();
  await svc.from('coin_balances').upsert(
    {
      user_id: msg.sender_id,
      balance: (hostBal?.balance ?? 0) + hostEarnings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  await svc.from('messages').update({
    unlocked_by: [...(msg.unlocked_by ?? []), user.id],
  }).eq('id', messageId);

  return NextResponse.json({ success: true });
}
