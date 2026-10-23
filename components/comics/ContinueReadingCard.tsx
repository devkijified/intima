'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronRight } from '@/lib/icons';

interface ContinueState {
  state: 'resume' | 'continue' | 'none';
  title?: string;
  coverUrl?: string | null;
  episodeId?: string;
  episodeNo?: number;
  totalEpisodes?: number;
  progressPct?: number | null;
}

/**
 * Dashboard card for the comic the member is currently reading:
 * cover, where they stopped, and one tap back into the episode.
 * Renders nothing until the answer arrives, and nothing at all
 * when there is no reading in progress, so the dashboard never
 * carries an empty shell for members who have not started a comic.
 */
export function ContinueReadingCard() {
  const [data, setData] = useState<ContinueState | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/comics/continue')
      .then((r) => (r.ok ? r.json() : { state: 'none' }))
      .then((d) => {
        if (live) setData(d as ContinueState);
      })
      .catch(() => {
        if (live) setData({ state: 'none' });
      });
    return () => {
      live = false;
    };
  }, []);

  if (!data || data.state === 'none' || !data.episodeId) return null;

  const resuming = data.state === 'resume';
  const pct = typeof data.progressPct === 'number' ? data.progressPct : null;
  const sub = resuming
    ? `Episode ${data.episodeNo} of ${data.totalEpisodes}${pct !== null ? `, ${pct}% read` : ''}`
    : `Next up: Episode ${data.episodeNo} of ${data.totalEpisodes}`;

  return (
    <Link
      href={`/comics/${data.episodeId}`}
      className="card-luxe flex items-center gap-4 p-4 transition-all hover:shadow-lift active:scale-[0.99] sm:p-5"
    >
      {data.coverUrl ? (
        <img
          src={data.coverUrl}
          alt=""
          className="h-20 w-14 shrink-0 rounded-xl object-cover ring-1 ring-black/[0.06]"
        />
      ) : (
        <span className="flex h-20 w-14 shrink-0 items-center justify-center rounded-xl bg-[#AC244D]/10">
          <BookOpen aria-hidden className="h-6 w-6 text-[#AC244D]" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#AC244D]">
          Continue reading
        </span>
        <span className="mt-0.5 block truncate font-display text-lg font-semibold tracking-tight text-charcoal">
          {data.title}
        </span>
        <span className="block text-sm text-neutral-500">{sub}</span>
        {resuming && pct !== null && (
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-black/[0.08]">
            <span
              className="block h-full rounded-full bg-[#AC244D]"
              style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
            />
          </span>
        )}
      </span>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#AC244D] text-white shadow-lg shadow-[#AC244D]/25">
        <ChevronRight aria-hidden className="h-5 w-5" />
      </span>
    </Link>
  );
}
