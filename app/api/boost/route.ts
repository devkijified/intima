import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const BOOST_COST_COINS = 500; // 30 minutes, top of map
const BOOST_MINUTES = 30;

/** POST /api/boost: companions buy top-of-map placement with coins. */
export async function POST(_req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile } = await svc.from('profiles')
    .select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'model') {
    return NextResponse.json({ error: 'Companions only' }, { status: 403 });
  }

  const { error: spendErr } = await svc.rpc('spend_coins', {
    p_user_id: user.id,
    p_amount: BOOST_COST_COINS,
    p_kind: 'boost',
    p_ref: null,
    p_meta: {},
  });
  if (spendErr) {
    if (String(spendErr.message).includes('insufficient_balance')) {
      return NextResponse.json({ error: `You need ${BOOST_COST_COINS} coins to boost.` }, { status: 402 });
    }
    throw spendErr;
  }

  const ends = new Date(Date.now() + BOOST_MINUTES * 60 * 1000);
  const { error } = await svc.from('boosts').insert({
    provider_id: user.id,
    coins_spent: BOOST_COST_COINS,
    ends_at: ends.toISOString(),
  });
  if (error) throw error;

  return NextResponse.json({ success: true, endsAt: ends.toISOString(), minutes: BOOST_MINUTES });
}
