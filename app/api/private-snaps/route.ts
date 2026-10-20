import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck';

/**
 * Private snaps: fan-only photo and video collections on a companion
 * profile (migration 047). Media sits in the private 'private-snaps'
 * bucket under the provider's own <uid>/ folder and is never
 * publicly addressable.
 *
 * GET  /api/private-snaps?provider_id=: summary for everyone
 *      (isOwner, isSubscriber, fanPriceCoins, totalCount, and
 *      collection names with counts). With &detail=1, an owner or an
 *      effective subscriber also gets the snaps themselves, each
 *      with a service-role signed URL (1 hour). Non-subscribers
 *      never receive storage paths or signed URLs. A subscription
 *      is effective while 'active', or 'cancelled' with the paid
 *      period still running, the same rule as /api/subscriptions.
 * POST /api/private-snaps { storagePath, mediaType, caption?,
 *      collection? }: a companion registers a snap she already
 *      uploaded into her own folder. Captions pass the contact-leak
 *      scan, like every other companion text surface.
 * DELETE /api/private-snaps?id=: the owner removes a snap (row,
 *      plus a best-effort storage delete).
 */

const BUCKET = 'private-snaps';
const SIGNED_URL_TTL_SECONDS = 3600;
const DEFAULT_COLLECTION = 'Private snaps';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface SubRow {
  status: string;
  current_period_end: string;
}

function isEffectiveSub(row: SubRow, now: Date): boolean {
  if (row.status === 'active') return true;
  if (row.status === 'cancelled') {
    return new Date(row.current_period_end).getTime() > now.getTime();
  }
  return false;
}

interface SnapRow {
  id: string;
  storage_path: string;
  media_type: string;
  caption: string | null;
  collection: string;
  created_at: string;
}

export async function GET(req: NextRequest) {
  try {
    const providerId = req.nextUrl.searchParams.get('provider_id');
    if (!providerId) {
      return NextResponse.json({ error: 'provider_id required' }, { status: 400 });
    }
    const detail = req.nextUrl.searchParams.get('detail') === '1';

    // The viewer may be signed out; that just makes them "other".
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const svc = service();
    const { data: provider } = await svc
      .from('profiles')
      .select('sub_price_coins')
      .eq('id', providerId)
      .maybeSingle();
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }
    const fanPriceCoins =
      typeof provider.sub_price_coins === 'number' && provider.sub_price_coins > 0
        ? provider.sub_price_coins
        : null;

    const isOwner = !!user && user.id === providerId;

    let isSubscriber = false;
    if (user && !isOwner) {
      const { data: rows } = await svc
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('subscriber_id', user.id)
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false })
        .limit(5);
      const now = new Date();
      isSubscriber = ((rows ?? []) as SubRow[]).some((r) => isEffectiveSub(r, now));
    }

    const { data: snapData, error: snapErr } = await svc
      .from('private_snaps')
      .select('id, storage_path, media_type, caption, collection, created_at')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .limit(300);
    if (snapErr) throw snapErr;
    const snaps = (snapData ?? []) as SnapRow[];

    // Collection names and counts, in most-recent-first order.
    const counts = new Map<string, number>();
    for (const s of snaps) {
      counts.set(s.collection, (counts.get(s.collection) ?? 0) + 1);
    }
    const collections = Array.from(counts.entries()).map(([name, count]) => ({
      name,
      count,
    }));

    const body: {
      isOwner: boolean;
      isSubscriber: boolean;
      fanPriceCoins: number | null;
      totalCount: number;
      collections: { name: string; count: number }[];
      snaps?: {
        id: string;
        mediaType: string;
        caption: string | null;
        collection: string;
        createdAt: string;
        url: string;
      }[];
    } = {
      isOwner,
      isSubscriber,
      fanPriceCoins,
      totalCount: snaps.length,
      collections,
    };

    if (detail && (isOwner || isSubscriber)) {
      if (snaps.length === 0) {
        body.snaps = [];
      } else {
        const { data: signed } = await svc.storage
          .from(BUCKET)
          .createSignedUrls(
            snaps.map((s) => s.storage_path),
            SIGNED_URL_TTL_SECONDS
          );
        const urlByPath = new Map<string, string>();
        for (const s of signed ?? []) {
          if (s.path && s.signedUrl && !s.error) {
            urlByPath.set(s.path, s.signedUrl);
          }
        }
        body.snaps = snaps
          .filter((s) => urlByPath.has(s.storage_path))
          .map((s) => ({
            id: s.id,
            mediaType: s.media_type,
            caption: s.caption,
            collection: s.collection,
            createdAt: s.created_at,
            url: urlByPath.get(s.storage_path) as string,
          }));
      }
    }

    return NextResponse.json(body);
  } catch (e) {
    console.error('[private-snaps GET]', e);
    return NextResponse.json({ error: 'Could not load private snaps' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const svc = service();
    const { data: profile } = await svc
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role !== 'model') {
      return NextResponse.json(
        { error: 'Only companions can add private snaps' },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => null)) as {
      storagePath?: unknown;
      mediaType?: unknown;
      caption?: unknown;
      collection?: unknown;
    } | null;
    const storagePath = body?.storagePath;
    const mediaType = body?.mediaType;
    if (typeof storagePath !== 'string' || !storagePath.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        { error: 'storagePath must be a file inside your own folder' },
        { status: 400 }
      );
    }
    if (mediaType !== 'image' && mediaType !== 'video') {
      return NextResponse.json(
        { error: 'mediaType must be image or video' },
        { status: 400 }
      );
    }

    const caption =
      typeof body?.caption === 'string' && body.caption.trim()
        ? body.caption.trim().slice(0, 300)
        : null;
    if (caption) {
      const scan = scanForLeaks(caption);
      if (!scan.clean) {
        return NextResponse.json({ error: leakWarning(scan.leaks) }, { status: 400 });
      }
    }

    const collection =
      typeof body?.collection === 'string' && body.collection.trim()
        ? body.collection.trim().slice(0, 40)
        : DEFAULT_COLLECTION;

    const { data: row, error } = await svc
      .from('private_snaps')
      .insert({
        provider_id: user.id,
        storage_path: storagePath,
        media_type: mediaType,
        caption,
        collection,
      })
      .select('id, media_type, caption, collection, created_at')
      .single();
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      snap: {
        id: row.id,
        mediaType: row.media_type,
        caption: row.caption,
        collection: row.collection,
        createdAt: row.created_at,
      },
    });
  } catch (e) {
    console.error('[private-snaps POST]', e);
    return NextResponse.json({ error: 'Could not add the snap' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const svc = service();
    const { data: row } = await svc
      .from('private_snaps')
      .select('id, provider_id, storage_path')
      .eq('id', id)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: 'Snap not found' }, { status: 404 });
    }
    if (row.provider_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only delete your own snaps' },
        { status: 403 }
      );
    }

    const { error } = await svc.from('private_snaps').delete().eq('id', id);
    if (error) throw error;

    // Best effort: the row is gone either way, so a storage hiccup
    // should not fail the delete the owner already sees as done.
    await svc.storage.from(BUCKET).remove([row.storage_path]).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[private-snaps DELETE]', e);
    return NextResponse.json({ error: 'Could not delete the snap' }, { status: 500 });
  }
}
