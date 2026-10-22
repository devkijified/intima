'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2, Ticket } from '@/lib/icons';
import { HelpTip } from '@/components/ui/Tooltip';
import { showToast } from '@/lib/toast';

interface TicketRow {
  id: string;
  subject: string;
  category: string;
  status: 'open' | 'answered' | 'resolved' | 'closed';
  last_message_at: string;
}

const CATEGORIES = [
  { value: 'general', label: 'General question' },
  { value: 'payments', label: 'Payments and coins' },
  { value: 'account', label: 'My account' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'technical', label: 'Something is broken' },
  { value: 'other', label: 'Something else' },
];

const STATUS_COPY: Record<TicketRow['status'], { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-primary-muted text-primary' },
  answered: { label: 'Support replied', cls: 'bg-emerald-50 text-emerald-700' },
  resolved: { label: 'Resolved', cls: 'bg-neutral-100 text-neutral-500' },
  closed: { label: 'Closed', cls: 'bg-neutral-100 text-neutral-400' },
};

/**
 * Support tickets: ask the team anything, in private. Replies land
 * here and as a notification; replying reopens a resolved ticket.
 */
export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [formMsg, setFormMsg] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/tickets');
    const d = await res.json().catch(() => ({}));
    if (res.ok) setTickets(d.tickets ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setSending(true);
    setFormMsg('');
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: subject.trim(), category, body: body.trim() }),
    });
    const d = await res.json().catch(() => ({}));
    setSending(false);
    if (res.ok) {
      setSubject('');
      setBody('');
      setCategory('general');
      showToast('Ticket opened. Our team will reply here.');
      void load();
    } else {
      setFormMsg(d.error ?? 'Could not open your ticket. Please try again.');
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 animate-rise-in">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-muted">
          <Ticket aria-hidden className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h1 className="t-page-title text-charcoal">Support tickets</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-neutral-500">
            Private messages between you and the Intima team.
            <HelpTip text="Tickets are private: only you and the support team can read them. For safety emergencies during a meeting, use the report button on the connection instead, it reaches the team faster." />
          </p>
        </div>
      </div>

      <div className="card-luxe mt-5 p-5">
        <h2 className="t-section-title text-charcoal">New ticket</h2>
        <div className="mt-3 space-y-3">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject, e.g. My coin top-up has not landed"
            maxLength={120}
            className="min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base outline-none focus:border-primary md:text-sm"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Ticket category"
            className="min-h-[44px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-base outline-none focus:border-primary md:text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Tell us what happened, in your own words."
            rows={4}
            maxLength={4000}
            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base outline-none focus:border-primary md:text-sm"
          />
          <button
            type="button"
            onClick={create}
            disabled={sending || subject.trim().length < 3 || !body.trim()}
            className="btn-luxe flex min-h-[48px] w-full items-center justify-center gap-2 px-5 py-3 text-sm disabled:opacity-50"
          >
            {sending && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
            {sending ? 'Opening…' : 'Open ticket'}
          </button>
          {formMsg && <p className="text-sm text-red-600">{formMsg}</p>}
        </div>
      </div>

      <h2 className="t-section-title mt-7 text-charcoal">Your tickets</h2>
      {loading ? (
        <div className="mt-4 h-28 animate-pulse rounded-3xl bg-neutral-100" />
      ) : tickets.length === 0 ? (
        <p className="mt-3 rounded-3xl bg-white p-6 text-center text-sm text-neutral-500 ring-1 ring-black/[0.04]">
          No tickets yet. When you need the team, open one above.
        </p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/tickets/${t.id}`}
              className="group flex items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-black/[0.045] shadow-soft transition-all active:scale-[0.99]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[15px] font-semibold tracking-tight text-charcoal">
                  {t.subject}
                </span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  Last update {new Date(t.last_message_at).toLocaleString('en-GB', {
                    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                  })}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_COPY[t.status].cls}`}>
                {STATUS_COPY[t.status].label}
              </span>
              <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
