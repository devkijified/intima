import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/payments/crypto/status?ref=CRYPTO-XXXXXX
 * The payer's own checkout state, driven by the webhook. The booking
 * modal polls this after a crypto payment until it flips to finished.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const ref = req.nextUrl.searchParams.get('ref');
  if (!ref) return NextResponse.json({ error: 'ref is required' }, { status: 400 });

  const { data } = await supabase
    .from('crypto_payments')
    .select('reference, kind, status, target_provider_id, amount_ngn')
    .eq('reference', ref)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(data);
}
