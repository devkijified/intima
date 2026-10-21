import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notifyUsers } from '@/lib/push-server';
import { sweepBoard } from '@/lib/board/board';

/**
 * GET /api/cron/disputes
 * Auto-release for stale fee disputes: a dispute that has sat open for
 * 7 days with no admin decision is closed and the connection fee is
 * released (it stands). The dispute is only about the platform
 * connection fee; no companion funds are ever held or moved here, and
 * the release itself is just the fee_state bookkeeping. Actual money
 * movement on any dispute stays manual through the original rail.
 *
 * Auth: callers send `Authorization: Bearer <CRON_SECRET>`, same as
 * the transfer poller.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: stale } = await svc
    .from('connections')
    .select('id, client_id, provider_id')
    .eq('fee_state', 'disputed')
    .lt('dispute_opened_at', cutoff)
    .order('dispute_opened_at', { ascending: true });

  let released = 0;
  for (const conn of stale ?? []) {
    // Race guard: only the run that still sees fee_state 'disputed'
    // performs the release, so an admin resolving at the same moment
    // always wins and nobody gets released twice.
    const { data: updated, error } = await svc
      .from('connections')
      .update({
        fee_state: 'released',
        dispute_outcome: 'auto_released',
        dispute_resolved_at: new Date().toISOString(),
      })
      .eq('id', conn.id)
      .eq('fee_state', 'disputed')
      .select('id')
      .maybeSingle();
    if (error || !updated) continue;

    await svc.from('dispute_events').insert({
      connection_id: conn.id,
      actor_id: null,
      kind: 'auto_released',
      note: 'auto_released',
    });

    await notifyUsers({
      userIds: [conn.client_id, conn.provider_id],
      type: 'dispute_resolved',
      title: 'Dispute closed',
      body: 'The dispute was open for 7 days with no decision, so the connection fee has been released.',
      link: `/messages/${conn.id}`,
    }).catch(() => {});

    released++;
  }

  // The request board rides this sweep: settle paid requests,
  // expire due ones and refund their fees, retry stuck refunds.
  // Reads also settle and expire lazily, so this is the backstop,
  // not the only path.
  const board = await sweepBoard(svc).catch(() => null);

  return NextResponse.json({ released, board });
}
