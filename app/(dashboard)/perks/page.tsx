'use client';

import { PullToRefresh } from '@/components/shared/PullToRefresh'
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trophy } from '@/lib/icons';
import { coinsWithNgn } from '@/lib/utils/helpers';

interface ContestCard {
  id: string;
  title: string;
  theme: string;
  prizeCoins: number;
  startsAt: string;
  endsAt: string;
  phase: 'upcoming' | 'live' | 'ended' | 'paid';
  entryCount: number;
}

const PHASE_LABEL: Record<ContestCard['phase'], string> = {
  upcoming: 'Opens soon',
  live: 'Live now',
  ended: 'Ended',
  paid: 'Winners paid',
};

function when(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

export default function PerksPage() {
  const [contests, setContests] = useState<ContestCard[] | null>(null);
  const [error, setError] = useState('');

  const loadContests = async () => {
    const res = await fetch('/api/perks');
    const d = await res.json().catch(() => ({}));
    if (res.ok) setContests(d.contests ?? []);
    else setError(d.error ?? 'Could not load Perks.');
  };

  useEffect(() => {
    loadContests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PullToRefresh onRefresh={loadContests} className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-muted">
          <Trophy className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold text-charcoal">Perks</h1>
          <p className="text-sm text-neutral-500">
            Challenges and photo contests. Enter, vote, and win coins.
          </p>
        </div>
      </div>

      <p className="mt-4 rounded-2xl bg-cream p-3 text-sm text-neutral-600">
        Companions enter with a photo. Everybody votes. Winners take the prize
        in coins, and the smart move is sharing your entry link: every voter
        you pull in raises your count and grows the house.
      </p>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {contests === null && !error && (
        <div className="mt-6 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-3xl bg-neutral-100" />
          ))}
        </div>
      )}
      {contests !== null && contests.length === 0 && (
        <p className="py-10 text-center text-sm text-neutral-400">
          No contests running right now. The next one lands here first.
        </p>
      )}

      <div className="mt-5 space-y-3">
        {(contests ?? []).map((c) => (
          <Link key={c.id} href={`/perks/${c.id}`} className="card-luxe block p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold text-charcoal">{c.title}</p>
                {c.theme && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500">{c.theme}</p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  c.phase === 'live'
                    ? 'bg-red-100 text-red-600'
                    : c.phase === 'upcoming'
                      ? 'bg-gold/20 text-yellow-700'
                      : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {PHASE_LABEL[c.phase]}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
              <span className="font-semibold text-charcoal">
                Prize: {coinsWithNgn(c.prizeCoins)}
              </span>
              <span>{c.entryCount} {c.entryCount === 1 ? 'entry' : 'entries'}</span>
              <span>
                {when(c.startsAt)} to {when(c.endsAt)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </PullToRefresh>
  );
}
