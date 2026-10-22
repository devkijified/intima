import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getRefundPct, refundAmountNgn } from '@/lib/payments/paystack';
import {
  loadHeldFee,
  feeConsumed,
  feeExpiry,
  isProviderUnavailable,
  materializeHold,
  similarProvidersFor,
} from '@/lib/payments/heldFee';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/connections/fee?ref=REFERENCE
 * The state of one paid connection fee, for the held-fee page:
 * what it was paid for, whether it is still held, applied, or on
 * the refund path, when the hold ends, and which available
 * companions it could be applied to instead. Owner only: a
 * reference in someone else's hands reads as not found.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const ref = req.nextUrl.searchParams.get('ref');
  if (!ref) {
    return NextResponse.json({ error: 'ref is required' }, { status: 400 });
  }

  const svc = service();
  const fee = await loadHeldFee(svc, ref);

  if (!fee || fee.userId !== user.id) {
    // Maybe the fee already opened its connection before the hold
    // machinery saw it: answer from the connection itself.
    const { data: conn } = await svc
      .from('connections')
      .select('provider_id')
      .eq('payment_ref', ref)
      .eq('client_id', user.id)
      .maybeSingle();
    if (conn) {
      const provider = await profileBrief(svc, conn.provider_id as string);
      return NextResponse.json({
        state: 'applied',
        reference: ref,
        appliedProvider: provider,
      });
    }
    return NextResponse.json(
      { error: 'We could not find a settled connection fee with that reference.' },
      { status: 404 }
    );
  }

  const consumed = await feeConsumed(svc, ref);
  const pct = await getRefundPct(svc);
  const target = fee.targetProviderId
    ? await profileBrief(svc, fee.targetProviderId)
    : null;
  const targetAvailableNow = fee.targetProviderId
    ? !(await isProviderUnavailable(svc, fee.targetProviderId))
    : false;

  const state = consumed
    ? 'applied'
    : fee.disposition === 'open'
      ? 'held'
      : fee.disposition;

  return NextResponse.json({
    state,
    reference: ref,
    rail: fee.rail,
    amountNgn: fee.amountNgn,
    refundPct: pct,
    refundAmountNgn: refundAmountNgn(fee.amountNgn, pct),
    expiresAt: state === 'held' ? feeExpiry(fee).toISOString() : null,
    target: target ? { ...target, availableNow: targetAvailableNow } : null,
    appliedProvider: fee.appliedProviderId
      ? await profileBrief(svc, fee.appliedProviderId)
      : consumed && fee.targetProviderId
        ? target
        : null,
    similar:
      state === 'held' && fee.targetProviderId
        ? await similarProvidersFor(svc, fee.targetProviderId)
        : [],
  });
}

/**
 * POST /api/connections/fee
 * Materialize the hold on a settled, unused fee: stamp its hold
 * window and send the client the notification that carries his
 * way back (the held-fee page link). Called by the request modal
 * when a booking lands on an unavailable companion after payment,
 * so the fee is recoverable even if he closes the modal and never
 * returns to it. Idempotent: an already-stamped hold is untouched
 * and does not notify again.
 * Body: { payment_ref }
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    payment_ref?: string;
  } | null;
  if (!body?.payment_ref) {
    return NextResponse.json({ error: 'payment_ref is required' }, { status: 400 });
  }

  const svc = service();
  const fee = await loadHeldFee(svc, body.payment_ref);
  if (!fee || fee.userId !== user.id) {
    return NextResponse.json(
      { error: 'We could not find a settled connection fee with that reference.' },
      { status: 404 }
    );
  }
  if (fee.disposition !== 'open' || (await feeConsumed(svc, fee.reference))) {
    return NextResponse.json({ state: 'not_held' });
  }
  await materializeHold(svc, fee);
  return NextResponse.json({ state: 'held', expiresAt: feeExpiry(fee).toISOString() });
}

async function profileBrief(
  svc: ReturnType<typeof service>,
  providerId: string
): Promise<{
  id: string;
  name: string;
  avatar: string | null;
  username: string | null;
  city: string | null;
} | null> {
  const { data } = await svc
    .from('profiles')
    .select('display_name, avatar_url, username')
    .eq('id', providerId)
    .maybeSingle();
  if (!data) return null;
  const { data: presence } = await svc
    .from('provider_presence')
    .select('city')
    .eq('provider_id', providerId)
    .maybeSingle();
  return {
    id: providerId,
    name:
      (data as { display_name?: string | null }).display_name ??
      'Intima companion',
    avatar: (data as { avatar_url?: string | null }).avatar_url ?? null,
    username: (data as { username?: string | null }).username ?? null,
    city: (presence as { city?: string | null } | null)?.city ?? null,
  };
}
