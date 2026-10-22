import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { COIN_PACKAGES } from '@/lib/coins/packages';
import { cryptoConfigured, createCryptoInvoice } from '@/lib/payments/nowpayments';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function makeReference(): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CRYPTO-${rand}`;
}

/**
 * POST /api/payments/crypto/create
 * Starts a crypto checkout for coins or a connection fee and returns
 * the hosted invoice URL. Dormant (503) until gateway keys are set.
 * Body: { kind: 'coins', package_id } | { kind: 'connection_fee', provider_id }
 */
export async function POST(req: NextRequest) {
  if (!cryptoConfigured()) {
    return NextResponse.json(
      { error: 'Crypto payments are not switched on yet.' },
      { status: 503 }
    );
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    kind?: string;
    package_id?: string;
    provider_id?: string;
  } | null;
  if (!body?.kind) {
    return NextResponse.json({ error: 'kind is required' }, { status: 400 });
  }

  const svc = service();

  const { data: rateRow } = await svc
    .from('platform_settings')
    .select('value')
    .eq('key', 'usd_ngn_rate')
    .maybeSingle();
  const rate = Number(rateRow?.value ?? 1550);

  let amountNgn = 0;
  let coins: number | null = null;
  let targetProviderId: string | null = null;
  let description = '';

  if (body.kind === 'coins') {
    const pkg = COIN_PACKAGES.find((p) => p.id === body.package_id);
    if (!pkg) return NextResponse.json({ error: 'Unknown package' }, { status: 400 });
    amountNgn = pkg.priceNgn;
    coins = pkg.coins;
    description = `Intima coins: ${pkg.label} (${pkg.coins} coins)`;
  } else if (body.kind === 'connection_fee') {
    if (!body.provider_id) {
      return NextResponse.json({ error: 'provider_id is required' }, { status: 400 });
    }
    const { data: feeRow } = await svc
      .from('platform_settings')
      .select('value')
      .eq('key', 'connection_fee_ngn')
      .maybeSingle();
    amountNgn = Number(feeRow?.value ?? 5000);
    targetProviderId = body.provider_id;
    description = 'Intima connection fee';
  } else {
    return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
  }

  const reference = makeReference();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  const { error: insErr } = await svc.from('crypto_payments').insert({
    user_id: user.id,
    kind: body.kind,
    reference,
    amount_ngn: amountNgn,
    coins,
    target_provider_id: targetProviderId,
    status: 'pending',
  });
  if (insErr) {
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 });
  }

  try {
    const invoice = await createCryptoInvoice({
      amountUsd: Math.max(1, Math.round((amountNgn / rate) * 100) / 100),
      orderId: reference,
      description,
      ipnCallbackUrl: `${origin}/api/payments/crypto/webhook`,
      successUrl: `${origin}/coins?crypto=success&ref=${reference}`,
      cancelUrl: `${origin}/coins?crypto=cancelled&ref=${reference}`,
    });
    await svc
      .from('crypto_payments')
      .update({ provider_payment_id: invoice.invoiceId, invoice_url: invoice.invoiceUrl })
      .eq('reference', reference);
    return NextResponse.json({ invoiceUrl: invoice.invoiceUrl, reference });
  } catch (e) {
    await svc
      .from('crypto_payments')
      .update({ status: 'failed' })
      .eq('reference', reference);
    return NextResponse.json(
      { error: 'We could not start that payment. Please try again.' },
      { status: 502 }
    );
  }
}
