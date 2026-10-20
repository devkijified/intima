import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/** POST /api/coins/transfer-intent/cancel: cancels your own pending intent. */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { reference } = await req.json().catch(() => ({}));
  if (typeof reference !== 'string' || !reference) {
    return NextResponse.json({ error: 'reference required' }, { status: 400 });
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  await svc
    .from('transfer_intents')
    .update({ status: 'cancelled' })
    .eq('reference', reference.toUpperCase().trim())
    .eq('user_id', user.id)
    .eq('status', 'pending');

  return NextResponse.json({ ok: true });
}
