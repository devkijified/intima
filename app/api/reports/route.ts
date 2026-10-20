import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck';
import { notifyUsers } from '@/lib/push-server';

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/reports
 * Body: { provider_id, reason, details? }
 * Files a safety report against a provider. Report text is user
 * text, so it passes the same contact-leak scan as reviews and
 * broadcasts before it is stored.
 *
 * Abuse threshold: once a provider holds 3 or more open reports
 * from the last 30 days, her profile is hidden from the map
 * (profiles.is_hidden, migration 044) and every admin is notified,
 * mirroring how the dispute route alerts admins. Unhiding stays a
 * manual admin decision after review.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    provider_id?: string;
    reason?: string;
    details?: string;
  } | null;
  if (!body?.provider_id) {
    return NextResponse.json({ error: 'provider_id is required' }, { status: 400 });
  }
  const reason = (body.reason ?? '').trim().slice(0, 500);
  if (!reason) {
    return NextResponse.json({ error: 'Tell us what happened' }, { status: 400 });
  }
  const details = (body.details ?? '').trim().slice(0, 1000);

  for (const text of [reason, details]) {
    if (!text) continue;
    const scan = scanForLeaks(text);
    if (!scan.clean) {
      return NextResponse.json({ error: leakWarning(scan.leaks) }, { status: 400 });
    }
  }

  const svc = service();
  const { error: insertError } = await svc.from('reports').insert({
    reporter_id: user.id,
    reported_provider_id: body.provider_id,
    reason,
    details: details || null,
    status: 'open',
  });
  if (insertError) {
    return NextResponse.json({ error: 'Could not file the report' }, { status: 500 });
  }

  // Threshold check: open reports inside the last 30 days.
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { count } = await svc
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('reported_provider_id', body.provider_id)
    .eq('status', 'open')
    .gte('created_at', since);

  let hidden = false;
  if ((count ?? 0) >= 3) {
    const { data: provider } = await svc
      .from('profiles')
      .select('is_hidden')
      .eq('id', body.provider_id)
      .maybeSingle();
    if (provider && provider.is_hidden !== true) {
      const { error: hideError } = await svc
        .from('profiles')
        .update({ is_hidden: true })
        .eq('id', body.provider_id);
      if (!hideError) {
        hidden = true;
        const { data: admins } = await svc
          .from('profiles')
          .select('id')
          .in('role', ['admin', 'super_admin']);
        if (admins && admins.length > 0) {
          await notifyUsers({
            userIds: admins.map((a) => a.id),
            type: 'provider_hidden',
            title: 'Provider hidden by report threshold',
            body: 'A provider reached 3 open reports in 30 days and was hidden from the map. Review the reports to decide whether to restore her or keep her hidden.',
            link: '/admin/reports',
          }).catch(() => {});
        }
      }
    } else if (provider?.is_hidden === true) {
      hidden = true;
    }
  }

  return NextResponse.json({ ok: true, hidden });
}
