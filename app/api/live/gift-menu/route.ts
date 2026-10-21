import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck';

/**
 * POST /api/live/gift-menu
 * Saves the companion's gift menu: a map of gift slug -> the short
 * reaction line she promises on camera when that gift lands
 * (profiles.gift_menu, migration 060). Viewers see up to three
 * pinned entries in the gift panel.
 *
 * Server-side by design: every line passes the contact-leak scanner
 * here, so a menu can never become a route around the connection
 * fee. Lines are display copy only; nothing here implies a gift
 * activates a real device.
 */
const MAX_LINE = 60;

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
      return NextResponse.json({ error: 'Only companions have a gift menu' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const raw = (body as { menu?: unknown }).menu;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return NextResponse.json({ error: 'menu must be an object of gift slug to reaction line' }, { status: 400 });
    }

    // Only active catalog gifts can carry a line.
    const { data: gifts } = await supabase
      .from('gift_catalog')
      .select('id')
      .eq('is_active', true);
    const valid = new Set((gifts ?? []).map((g: { id: string }) => g.id));

    const cleaned: Record<string, string> = {};
    for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!valid.has(slug) || typeof value !== 'string') continue;
      const line = value.trim().slice(0, MAX_LINE);
      if (!line) continue;
      const scan = scanForLeaks(line);
      if (!scan.clean) {
        return NextResponse.json({ error: leakWarning(scan.leaks) }, { status: 400 });
      }
      cleaned[slug] = line;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ gift_menu: cleaned })
      .eq('id', user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true, menu: cleaned });
  } catch (e) {
    console.error('[live/gift-menu]', e);
    return NextResponse.json({ error: 'Could not save your gift menu' }, { status: 500 });
  }
}
