import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notifyUsers } from '@/lib/push-server';

/**
 * Support tickets: companions and clients open a ticket, the
 * support team answers in the same thread. Tables in migration
 * 066 (support_tickets + ticket_messages). Ticket bodies are a
 * private user-to-admin channel, so they are deliberately NOT
 * leak-scanned: people must be able to describe account problems
 * in their own words.
 */

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function caller() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await svc()
    .from('profiles')
    .select('role, display_name, username')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = !!profile && ['admin', 'super_admin'].includes(profile.role);
  return { user, isAdmin };
}

const CATEGORIES = ['general', 'payments', 'account', 'safety', 'technical', 'other'];

/** GET /api/tickets: my tickets, or the whole queue for admins. */
export async function GET(req: NextRequest) {
  const me = await caller();
  if (!me) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const db = svc();
  const status = new URL(req.url).searchParams.get('status');
  let query = db
    .from('support_tickets')
    .select('id, user_id, subject, category, status, created_at, last_message_at')
    .order('last_message_at', { ascending: false })
    .limit(100);
  if (!me.isAdmin) query = query.eq('user_id', me.user.id);
  if (status && ['open', 'answered', 'resolved', 'closed'].includes(status)) {
    query = query.eq('status', status);
  }
  const { data: tickets, error } = await query;
  if (error) return NextResponse.json({ error: 'Could not load tickets' }, { status: 500 });

  let names = new Map<string, string>();
  if (me.isAdmin && tickets && tickets.length > 0) {
    const ids = [...new Set(tickets.map((t) => t.user_id))];
    const { data: profiles } = await db
      .from('profiles')
      .select('id, display_name, username')
      .in('id', ids);
    names = new Map(
      (profiles ?? []).map((p) => [p.id, p.display_name || (p.username ? `@${p.username}` : 'Member')]),
    );
  }
  return NextResponse.json({
    tickets: (tickets ?? []).map((t) => ({
      ...t,
      ownerName: names.get(t.user_id) ?? null,
    })),
  });
}

/** POST /api/tickets { subject, category, body }: open a ticket. */
export async function POST(req: NextRequest) {
  const me = await caller();
  if (!me) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 120) : '';
  const message = typeof body.body === 'string' ? body.body.trim().slice(0, 4000) : '';
  const category = CATEGORIES.includes(body.category) ? body.category : 'general';
  if (subject.length < 3) {
    return NextResponse.json({ error: 'Give your ticket a short subject.' }, { status: 400 });
  }
  if (message.length < 1) {
    return NextResponse.json({ error: 'Tell us what you need help with.' }, { status: 400 });
  }
  const db = svc();
  const { data: ticket, error } = await db
    .from('support_tickets')
    .insert({ user_id: me.user.id, subject, category, status: 'open' })
    .select('id')
    .single();
  if (error || !ticket) {
    return NextResponse.json({ error: 'Could not open your ticket. Please try again.' }, { status: 500 });
  }
  const { error: msgErr } = await db.from('ticket_messages').insert({
    ticket_id: ticket.id,
    sender_id: me.user.id,
    sender_role: 'user',
    body: message,
  });
  if (msgErr) {
    return NextResponse.json({ error: 'Could not save your message. Please try again.' }, { status: 500 });
  }
  // The support team hears about it right away.
  try {
    const { data: admins } = await db
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'super_admin']);
    const adminIds = (admins ?? []).map((a) => a.id).filter((id) => id !== me.user.id);
    if (adminIds.length > 0) {
      await notifyUsers({
        userIds: adminIds,
        type: 'ticket_update',
        title: 'New support ticket',
        body: subject,
        link: '/admin/tickets',
      });
    }
  } catch {
    /* best effort; the ticket stands */
  }
  return NextResponse.json({ ticketId: ticket.id });
}
