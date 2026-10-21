import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/track
 * First-party page view beacon. The PageViewBeacon component posts
 * { path, referrer, anonId } on every route view; this route stores
 * one row in page_views via the service role. Deliberately forgiving
 * like /api/logs: it always answers 204, never throws to the client,
 * skips bots and app-internal paths, and stores only the referrer
 * host (never the full referrer URL).
 */

const BOT_UA = /bot|crawler|spider|preview|headless/i;

function noContent() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get('user-agent') ?? '';
    if (BOT_UA.test(ua)) return noContent();

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) return noContent();

    const path =
      typeof body.path === 'string' ? body.path.slice(0, 300) : '';
    // Only real page views count: must be an in-app path, and the
    // API and admin surfaces are not traffic.
    if (
      !path.startsWith('/') ||
      path.startsWith('/api') ||
      path.startsWith('/admin')
    ) {
      return noContent();
    }

    let referrerHost: string | null = null;
    if (typeof body.referrer === 'string' && body.referrer.length > 0) {
      try {
        referrerHost = new URL(body.referrer.slice(0, 1000)).host || null;
      } catch {
        referrerHost = null;
      }
    }

    const anonId =
      typeof body.anonId === 'string' && body.anonId.length > 0
        ? body.anonId.slice(0, 64)
        : null;

    let userId: string | null = null;
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }

    const svc = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await svc.from('page_views').insert({
      path,
      referrer_host: referrerHost,
      user_id: userId,
      anon_id: anonId,
    });
  } catch {
    // Tracking must never break the caller.
  }
  return noContent();
}
