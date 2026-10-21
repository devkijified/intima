import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  return profile?.role === 'admin' || profile?.role === 'super_admin' ? user : null;
}

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/admin/gifts
 * The full gift catalog (active and inactive) for the admin store
 * page, ordered by price. Prices live in gift_catalog.coin_cost, so
 * edits here are what the live gift panel charges.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  const { data, error } = await service()
    .from('gift_catalog')
    .select('id, name, emoji, coin_cost, tier, anim_tier, is_active')
    .order('coin_cost', { ascending: true });
  if (error) {
    return NextResponse.json({ error: 'Could not load the gift catalog' }, { status: 500 });
  }
  return NextResponse.json({ gifts: data ?? [] });
}

/**
 * PATCH /api/admin/gifts { id, coin_cost?, is_active? }
 * Change a gift's store price (in coins) or switch it on/off in the
 * store. Takes effect immediately everywhere the catalog is read.
 */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    coin_cost?: number;
    is_active?: boolean;
  } | null;
  if (!body?.id) {
    return NextResponse.json({ error: 'Which gift?' }, { status: 400 });
  }
  const patch: { coin_cost?: number; is_active?: boolean } = {};
  if (body.coin_cost !== undefined) {
    const cost = Number(body.coin_cost);
    if (!Number.isInteger(cost) || cost < 1 || cost > 1000000) {
      return NextResponse.json(
        { error: 'Price must be a whole number of coins between 1 and 1,000,000' },
        { status: 400 }
      );
    }
    patch.coin_cost = cost;
  }
  if (body.is_active !== undefined) {
    patch.is_active = !!body.is_active;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
  }
  const { data, error } = await service()
    .from('gift_catalog')
    .update(patch)
    .eq('id', body.id)
    .select('id, name, emoji, coin_cost, tier, anim_tier, is_active')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'Could not save that gift' }, { status: 500 });
  }
  return NextResponse.json({ gift: data });
}
