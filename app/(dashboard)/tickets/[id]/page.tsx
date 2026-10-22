'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Send } from '@/lib/icons';

interface TicketDetail {
  id: string;
  subject: string;
  category: string;
  status: 'open' | 'answered' | 'resolved' | 'closed';
  created_at: string;
}

interface TicketMessage {
  id: string;
  sender_role: 'user' | 'admin';
  body: string;
  created_at: string;
}

const STATUS_LABEL: Record<TicketDetail['status'], string> = {
  open: 'Open, waiting on support',
  answered: 'Support replied',
  resolved: 'Resolved',
  closed: 'Closed',
};

/** One ticket thread: my messages on the right, support on the left. */
export default function TicketThreadPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params.id;
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tickets/${ticketId}`);
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setTicket(d.ticket);
      setMessages(d.messages ?? []);
    } else {
      setNotFound(true);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    setMsg('');
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: draft.trim() }),
    });
    const d = await res.json().catch(() => ({}));
    setSending(false);
    if (res.ok) {
      setDraft('');
      void load();
    } else {
      setMsg(d.error ?? 'Could not send your reply. Please try again.');
    }
  }

  async function closeTicket() {
    setSending(true);
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    });
    setSending(false);
    if (res.ok) void load();
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl px-4 pb-20 pt-16 text-center">
        <p className="font-display text-2xl font-semibold text-charcoal">Ticket not found</p>
        <Link href="/tickets" className="btn-luxe mt-6 inline-flex min-h-[44px] items-center justify-center px-6 py-2.5 text-sm">
          All tickets
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-24 pt-6 animate-rise-in">
      <Link href="/tickets" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary">
        <ArrowLeft aria-hidden className="h-4 w-4" /> All tickets
      </Link>
      <h1 className="t-page-title mt-1 text-charcoal">{ticket?.subject ?? 'Loading…'}</h1>
      {ticket && (
        <p className="mt-1 text-sm text-neutral-500">
          Status: {STATUS_LABEL[ticket.status]}
          {ticket.status !== 'closed' && (
            <>
              {' · '}
              <button type="button" onClick={closeTicket} disabled={sending} className="font-semibold text-primary disabled:opacity-50">
                Close this ticket
              </button>
            </>
          )}
        </p>
      )}

      <div className="mt-5 space-y-3">
        {messages.map((m) => {
          const mine = m.sender_role === 'user';
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-relaxed sm:max-w-[70%] ${
                  mine
                    ? 'rounded-br-lg bg-primary text-white'
                    : 'rounded-bl-lg bg-white text-charcoal ring-1 ring-black/[0.05]'
                }`}
              >
                {!mine && (
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                    Intima Support
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1.5 text-right text-[11px] ${mine ? 'text-white/70' : 'text-neutral-400'}`}>
                  {new Date(m.created_at).toLocaleString('en-GB', {
                    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="mt-6 rounded-3xl bg-white p-4 ring-1 ring-black/[0.05] shadow-soft">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            ticket?.status === 'resolved' || ticket?.status === 'closed'
              ? 'Replying will reopen this ticket.'
              : 'Write your reply…'
          }
          rows={3}
          maxLength={4000}
          className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base outline-none focus:border-primary md:text-sm"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !draft.trim()}
          className="btn-luxe mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 px-5 py-3 text-sm disabled:opacity-50"
        >
          {sending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Send aria-hidden className="h-4 w-4" />}
          {sending ? 'Sending…' : 'Send reply'}
        </button>
        {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
      </div>
    </div>
  );
}
