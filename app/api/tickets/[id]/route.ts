import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notifyUsers } from '@/lib/push-server';

/**
 * One ticket thread. GET returns the ticket plus its messages to
 * the owner or an admin. POST adds a reply and moves the status:
 * a member's reply reopens the ticket, a support reply marks it
 * answered; either side can also pass an explicit status (support
 * resolves, the owner can close).
 */

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function loadTicket(db: ReturnType<typeof svc>, id: string) {
  const { data } = await db
    .from('support_tickets')
    .select('id, user_id, subject, category, status, created_at, last_message_at')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const db = svc();
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = !!profile && ['admin', 'super_admin'].includes(profile.role);

  const ticket = await loadTicket(db, params.id);
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  if (!isAdmin && ticket.user_id !== user.id) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }
  const { data: messages } = await db
    .from('ticket_messages')
    .select('id, sender_id, sender_role, body, created_at')
    .eq('ticket_id', ticket.id)
    .order('created_at', { ascending: true })
    .limit(300);
  let ownerName: string | null = null;
  if (isAdmin) {
    const { data: owner } = await db
      .from('profiles')
      .select('display_name, username, role')
      .eq('id', ticket.user_id)
      .maybeSingle();
    ownerName = owner?.display_name || (owner?.username ? `@${owner.username}` : 'Member');
  }
  return NextResponse.json({ ticket: { ...ticket, ownerName }, messages: messages ?? [], isAdmin });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const db = svc();
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = !!profile && ['admin', 'super_admin'].includes(profile.role);

  const ticket = await loadTicket(db, params.id);
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  if (!isAdmin && ticket.user_id !== user.id) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const message = typeof body.body === 'string' ? body.body.trim().slice(0, 4000) : '';
  const wanted = typeof body.status === 'string' ? body.status : '';
  const allowed = isAdmin
    ? ['open', 'answered', 'resolved', 'closed']
    : ['open', 'closed'];
  const explicitStatus = allowed.includes(wanted) ? wanted : null;
  if (!message && !explicitStatus) {
    return NextResponse.json({ error: 'Write a reply, or pick a new status.' }, { status: 400 });
  }

  if (message) {
    const { error } = await db.from('ticket_messages').insert({
      ticket_id: ticket.id,
      sender_id: user.id,
      sender_role: isAdmin ? 'admin' : 'user',
      body: message,
    });
    if (error) {
      return NextResponse.json({ error: 'Could not send your reply. Please try again.' }, { status: 500 });
    }
  }

  const nextStatus = explicitStatus ?? (message ? (isAdmin ? 'answered' : 'open') : ticket.status);
  const now = new Date().toISOString();
  await db
    .from('support_tickets')
    .update({ status: nextStatus, last_message_at: now, updated_at: now })
    .eq('id', ticket.id);

  // Tell the other side.
  try {
    if (isAdmin) {
      await notifyUsers({
        userIds: [ticket.user_id],
        type: 'ticket_update',
        title: 'Support replied to your ticket',
        body: ticket.subject,
        link: `/tickets/${ticket.id}`,
      });
    } else if (message) {
      const { data: admins } = await db
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'super_admin']);
      const adminIds = (admins ?? []).map((a) => a.id).filter((id) => id !== user.id);
      if (adminIds.length > 0) {
        await notifyUsers({
          userIds: adminIds,
          type: 'ticket_update',
          title: 'New reply on a support ticket',
          body: ticket.subject,
          link: '/admin/tickets',
        });
      }
    }
  } catch {
    /* best effort; the reply stands */
  }

  return NextResponse.json({ ok: true, status: nextStatus });
}
