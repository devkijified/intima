import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getPremiumEligibility, unmetChecks } from '@/lib/live/premium';

/**
 * POST /api/live/start
 * Creates a live session for the immediate go-live flow in the host
 * studio. This lives server-side (the studio used to insert the row
 * from the browser) because access mode needs a server judgement:
 * a fans (Premium) stream may only be created by a companion who
 * clears the eligibility bar in lib/live/premium.ts. Public and paid
 * are never gated by that bar.
 *
 * Body: { title?, accessMode?: 'public' | 'paid' | 'fans', priceNgn? }.
 * Without accessMode the mode is derived from the price, as before:
 * a price means paid, no price means public.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role !== 'model') {
      return NextResponse.json(
        { error: 'Only companions can go live' },
        { status: 403 }
      );
    }

    const { title, accessMode, priceNgn } = await req.json();
    const rawPrice = Math.max(0, Math.round(Number(priceNgn ?? 0)) || 0);
    const mode =
      accessMode === 'public' || accessMode === 'paid' || accessMode === 'fans'
        ? accessMode
        : rawPrice > 0
          ? 'paid'
          : 'public';
    const price = mode === 'paid' ? rawPrice : 0;
    if (mode === 'paid' && price <= 0) {
      return NextResponse.json(
        { error: 'Set a join price, or choose Public or Premium' },
        { status: 400 }
      );
    }

    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (mode === 'fans') {
      const result = await getPremiumEligibility(service, user.id);
      if (!result.eligible) {
        return NextResponse.json(
          {
            error: 'Premium streams are not unlocked yet',
            checks: unmetChecks(result),
          },
          { status: 403 }
        );
      }
    }

    // One live stream per companion: end anything she still has open.
    await service
      .from('live_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('provider_id', user.id)
      .eq('status', 'live');

    const roomName = `intima-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const { data: session, error } = await service
      .from('live_sessions')
      .insert({
        provider_id: user.id,
        title:
          typeof title === 'string' && title.trim()
            ? title.trim().slice(0, 80)
            : 'Live now',
        // Paid stays unlisted until the ticket is paid; public and
        // fans list openly (fans entry is gated by the token route).
        is_public: mode !== 'paid',
        price_ngn: price,
        status: 'live',
        livekit_room: roomName,
        access_mode: mode,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      session: {
        id: session.id,
        access_mode: mode,
        price_ngn: price,
        livekit_room: roomName,
      },
    });
  } catch (e) {
    console.error('[live/start]', e);
    return NextResponse.json(
      { error: 'Could not start stream' },
      { status: 500 }
    );
  }
}
