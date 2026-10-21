import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * POST /api/chat/media-urls: mint short-lived signed URLs for chat
 * media stored in the private 'chat-media' bucket (migration 052).
 * Body: { messageIds: string[] }.
 *
 * A URL is minted only when the caller belongs to the message's
 * connection AND one of these holds:
 *   - the caller sent the message, or
 *   - the message is not PPV (no price, or price 0), or
 *   - the caller has unlocked the message (unlocked_by).
 * Otherwise the message is simply absent from the response: no
 * signed URL, no storage path beyond the one the client already
 * holds, nothing extra to leak. Messages whose media_url is a
 * legacy public URL are skipped; the client renders those as
 * before.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { messageIds } = await req.json().catch(() => ({}));
  if (!Array.isArray(messageIds) || messageIds.some((x) => typeof x !== 'string')) {
    return NextResponse.json({ error: 'messageIds required' }, { status: 400 });
  }
  const ids = [...new Set(messageIds as string[])].slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ urls: {} });

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: rows } = await svc
    .from('messages')
    .select('id, connection_id, sender_id, ppv_price_coins, unlocked_by, media_url')
    .in('id', ids);
  if (!rows || rows.length === 0) return NextResponse.json({ urls: {} });

  // One membership check per distinct connection in the batch.
  const connIds = [...new Set(rows.map((r) => r.connection_id))];
  const { data: conns } = await svc
    .from('connections')
    .select('id, client_id, provider_id')
    .in('id', connIds);
  const memberOf = new Set(
    (conns ?? [])
      .filter((c) => c.client_id === user.id || c.provider_id === user.id)
      .map((c) => c.id)
  );

  const allowed = new Map<string, string>();
  for (const r of rows) {
    if (!r.media_url || typeof r.media_url !== 'string') continue;
    if (r.media_url.startsWith('http')) continue; // legacy public URL
    if (!memberOf.has(r.connection_id)) continue;
    const price = r.ppv_price_coins ?? 0;
    const mayView =
      r.sender_id === user.id ||
      price <= 0 ||
      (r.unlocked_by ?? []).includes(user.id);
    if (mayView) allowed.set(r.id, r.media_url);
  }
  if (allowed.size === 0) return NextResponse.json({ urls: {} });

  const { data: signed } = await svc.storage
    .from('chat-media')
    .createSignedUrls([...allowed.values()], 3600);
  const urlByPath = new Map<string, string>();
  for (const s of signed ?? []) {
    if (s.path && s.signedUrl && !s.error) urlByPath.set(s.path, s.signedUrl);
  }

  const urls: Record<string, string> = {};
  for (const [messageId, path] of allowed) {
    const u = urlByPath.get(path);
    if (u) urls[messageId] = u;
  }
  return NextResponse.json({ urls });
}
