import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { scanForLeaks, leakWarning, CONTACT_WARNING } from '@/lib/moderation/contactCheck';

/**
 * POST /api/broadcasts — companions post to their channel.
 *
 * THE FENCE: broadcasts are free text seen by every follower, so they go
 * through the same contact-leak scanner as bios and story captions.
 * No phone numbers, no handles, no off-platform routes. Clients connect
 * through Intima and pay the connection fee; companions keep clients by
 * being worth following here, not by moving them off-platform.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles')
    .select('role').eq('id', user.id).maybeSingle();
  if (!profile || !['model', 'admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Companions only' }, { status: 403 });
  }

  const { body } = await req.json().catch(() => ({}));
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return NextResponse.json({ error: 'Write something first' }, { status: 400 });
  if (text.length > 1000) {
    return NextResponse.json({ error: 'Keep it under 1000 characters' }, { status: 400 });
  }

  const scan = scanForLeaks(text);
  if (!scan.clean) {
    return NextResponse.json(
      { error: `${leakWarning(scan.leaks)} ${CONTACT_WARNING}` },
      { status: 422 }
    );
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { error } = await svc.from('broadcasts').insert({ provider_id: user.id, body: text });
  if (error) throw error;

  return NextResponse.json({ success: true });
}
