import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { COIN_PACKAGES } from '@/lib/coins/packages';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function makeReference(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `INT-${s}`;
}

/**
 * POST /api/coins/transfer-intent
 * Creates a bank-transfer purchase intent.
 * Body: { packageId }. Returns { reference, amountNgn, coins, bank, expiresAt }.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

    const { packageId } = await req.json();
    const pkg = COIN_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) return NextResponse.json({ error: 'Invalid package' }, { status: 400 });

    const svc = service();

    // Platform bank details from settings.
    const { data: settings } = await svc
      .from('platform_settings')
      .select('key, value')
      .in('key', ['bank_name', 'bank_account_number', 'bank_account_name']);
    const get = (k: string) => settings?.find((s) => s.key === k)?.value ?? '';
    const bankName = get('bank_name');
    const accountNumber = get('bank_account_number');
    const accountName = get('bank_account_name');
    if (!bankName || !accountNumber || !accountName) {
      return NextResponse.json({ error: 'Bank transfers not configured yet' }, { status: 503 });
    }

    // Cancel any stale pending intents for this user.
    await svc.from('transfer_intents')
      .update({ status: 'cancelled' })
      .eq('user_id', user.id)
      .eq('status', 'pending');

    const reference = makeReference();
    const { data: intent, error } = await svc
      .from('transfer_intents')
      .insert({
        user_id: user.id,
        reference,
        amount_ngn: pkg.priceNgn,
        coins: pkg.coins,
      })
      .select('reference, amount_ngn, coins, expires_at')
      .single();
    if (error) throw error;

    return NextResponse.json({
      reference: intent.reference,
      amountNgn: intent.amount_ngn,
      coins: intent.coins,
      bank: { name: bankName, accountNumber, accountName },
      expiresAt: intent.expires_at,
    });
  } catch (e) {
    console.error('[transfer-intent]', e);
    return NextResponse.json({ error: 'Could not create transfer' }, { status: 500 });
  }
}

/**
 * GET /api/coins/transfer-intent — user's active intent, if any.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const svc = service();
  const { data: intent } = await svc
    .from('transfer_intents')
    .select('reference, amount_ngn, coins, status, expires_at, created_at')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!intent) return NextResponse.json({ intent: null });

  const { data: settings } = await svc
    .from('platform_settings')
    .select('key, value')
    .in('key', ['bank_name', 'bank_account_number', 'bank_account_name']);
  const get = (k: string) => settings?.find((s) => s.key === k)?.value ?? '';

  return NextResponse.json({
    intent: {
      ...intent,
      bank: {
        name: get('bank_name'),
        accountNumber: get('bank_account_number'),
        accountName: get('bank_account_name'),
      },
    },
  });
}
