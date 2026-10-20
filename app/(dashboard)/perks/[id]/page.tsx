'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Camera, Heart, Loader2, Share2, Trophy } from '@/lib/icons';
import { createClient } from '@/lib/supabase/client';
import { reencodeImage } from '@/lib/uploads/reencode';

const BUCKET = 'contest-entries';

interface Entry {
  id: string;
  providerId: string;
  providerName: string;
  providerUsername: string | null;
  providerAvatar: string | null;
  imageUrl: string;
  caption: string;
  votes: number;
  createdAt: string;
}

interface Detail {
  contest: {
    id: string;
    title: string;
    theme: string;
    prizeCoins: number;
    prizeSplit: number[];
    startsAt: string;
    endsAt: string;
    phase: 'upcoming' | 'live' | 'ended' | 'paid';
  };
  entries: Entry[];
  myEntry: { id: string; status: string } | null;
  myVoteEntryId: string | null;
  signedIn: boolean;
  myId: string | null;
}

export default function ContestPage() {
  const params = useParams<{ id: string }>();
  const contestId = params.id;
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [voteBusy, setVoteBusy] = useState<string | null>(null);
  const [voteMsg, setVoteMsg] = useState('');
  const [picked, setPicked] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [entering, setEntering] = useState(false);
  const [enterMsg, setEnterMsg] = useState('');
  const [shared, setShared] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/perks?contest=${encodeURIComponent(contestId)}`);
    const d = await res.json().catch(() => ({}));
    if (res.ok) setData(d as Detail);
    else setError(d.error ?? 'Could not load this contest.');
  }, [contestId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Arriving from a shared entry link: highlight that entry.
  useEffect(() => {
    if (!data) return;
    const wanted = new URLSearchParams(window.location.search).get('entry');
    if (!wanted) return;
    const el = document.getElementById(`entry-${wanted}`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('ring-2', 'ring-gold');
    }
  }, [data]);

  async function vote(entryId: string) {
    if (!data?.signedIn) {
      window.location.href = `/login?next=${encodeURIComponent(`/perks/${contestId}`)}`;
      return;
    }
    setVoteBusy(entryId);
    setVoteMsg('');
    const res = await fetch('/api/perks/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contestId, entryId }),
    });
    const d = await res.json().catch(() => ({}));
    setVoteBusy(null);
    if (res.ok) {
      setVoteMsg('Vote counted. You can move it any time before the contest ends.');
      void load();
    } else {
      setVoteMsg(d.error ?? 'Could not save your vote.');
    }
  }

  async function share(entry: Entry) {
    const url = `${window.location.origin}/perks/${contestId}?entry=${entry.id}`;
    const text = `Vote for ${entry.providerName} in ${data?.contest.title} on Intima.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Intima Perks', text, url });
        return;
      }
      throw new Error('no native share');
    } catch {
      try {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setShared(entry.id);
        setTimeout(() => setShared(''), 2500);
      } catch {
        setShared('');
      }
    }
  }

  async function enter() {
    if (!picked || !data?.myId) return;
    setEntering(true);
    setEnterMsg('');
    try {
      const supabase = createClient();
      const file = await reencodeImage(picked);
      const path = `${data.myId}/entry-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: 'image/jpeg', upsert: false });
      if (upErr) throw new Error('Photo upload failed. Please try again.');
      const res = await fetch('/api/perks/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contestId, storagePath: path, caption: caption.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
        throw new Error(d.error || 'Could not save your entry.');
      }
      setEnterMsg('Entry received. It goes live once our team approves it.');
      setPicked(null);
      setCaption('');
      void load();
    } catch (e) {
      setEnterMsg(e instanceof Error ? e.message : 'Could not save your entry.');
    }
    setEntering(false);
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/perks" className="mt-3 inline-block text-sm font-semibold text-primary">
          Back to Perks
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
        <div className="h-40 animate-pulse rounded-3xl bg-neutral-100" />
      </div>
    );
  }

  const { contest } = data;
  const live = contest.phase === 'live';
  const ranked = [...data.entries].sort(
    (a, b) => b.votes - a.votes || a.createdAt.localeCompare(b.createdAt),
  );
  const topThree = ranked.slice(0, 3);
  const endsLabel = new Date(contest.endsAt).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <Link href="/perks" className="text-sm font-semibold text-primary">
        All contests
      </Link>

      <div className="mt-3 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-muted">
          <Trophy className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold text-charcoal">{contest.title}</h1>
          {contest.theme && <p className="mt-0.5 text-sm text-neutral-500">{contest.theme}</p>}
          <p className="mt-1 text-xs text-neutral-500">
            Prize: <span className="font-semibold text-charcoal">{contest.prizeCoins.toLocaleString()} coins</span>
            {contest.prizeSplit.length > 1 &&
              ` split ${contest.prizeSplit.map((p) => `${p}%`).join(' / ')}`}
            {' · '}
            {live ? `Ends ${endsLabel}` : contest.phase === 'upcoming' ? 'Opens soon' : 'Voting closed'}
          </p>
        </div>
      </div>

      {topThree.length > 0 && (
        <div className="card-luxe mt-4 p-4">
          <p className="text-sm font-semibold text-charcoal">Leaderboard</p>
          <ol className="mt-2 space-y-1.5">
            {topThree.map((e, i) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="w-6 font-display font-semibold text-primary">{i + 1}.</span>
                <span className="flex-1 truncate text-charcoal">{e.providerName}</span>
                <span className="text-neutral-500">{e.votes} {e.votes === 1 ? 'vote' : 'votes'}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {data.signedIn && !data.myEntry && live && (
        <div className="card-luxe mt-4 p-4">
          <p className="text-sm font-semibold text-charcoal">Enter this contest</p>
          <p className="mt-1 text-xs text-neutral-500">
            Companions only, one photo each. Photos are cleaned of location data
            before they upload, and every entry is checked by our team before it
            can be voted on.
          </p>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional)"
            maxLength={300}
            className="mt-3 w-full rounded-2xl bg-cream px-4 py-3 text-sm text-charcoal outline-none ring-1 ring-black/[0.06] placeholder:text-neutral-400 focus:ring-primary/40"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={entering}
              className="btn-soft flex items-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              {picked ? 'Change photo' : 'Choose photo'}
            </button>
            {picked && <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{picked.name}</span>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setPicked(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={enter}
            disabled={entering || !picked}
            className="btn-luxe mt-3 flex h-11 w-full items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {entering && <Loader2 className="h-4 w-4 animate-spin" />}
            {entering ? 'Entering...' : 'Submit entry'}
          </button>
          {enterMsg && <p className="mt-2 text-sm text-neutral-600">{enterMsg}</p>}
        </div>
      )}
      {data.myEntry && (
        <p className="mt-4 rounded-2xl bg-cream p-3 text-sm text-neutral-600">
          {data.myEntry.status === 'pending'
            ? 'Your entry is with our team for a quick check. It goes live once approved.'
            : data.myEntry.status === 'approved'
              ? 'Your entry is live. Share its link and pull in your voters.'
              : 'Your entry was not approved for this contest.'}
        </p>
      )}

      {voteMsg && <p className="mt-3 text-sm text-neutral-600">{voteMsg}</p>}

      {data.entries.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">
          No entries yet. Be the first photo up.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {ranked.map((e) => {
            const mine = data.myId === e.providerId;
            const voted = data.myVoteEntryId === e.id;
            return (
              <div key={e.id} id={`entry-${e.id}`} className="card-luxe overflow-hidden rounded-3xl">
                <div className="relative aspect-[3/4] bg-neutral-100">
                  <img src={e.imageUrl} alt={e.caption || e.providerName} className="h-full w-full object-cover" draggable={false} />
                  <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {e.votes} {e.votes === 1 ? 'vote' : 'votes'}
                  </span>
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-semibold text-charcoal">{e.providerName}</p>
                  {e.caption && <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{e.caption}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void vote(e.id)}
                      disabled={!live || voteBusy === e.id || mine}
                      className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-all active:scale-95 disabled:opacity-50 ${
                        voted ? 'bg-primary text-white' : 'bg-cream text-charcoal ring-1 ring-black/[0.06]'
                      }`}
                    >
                      {voteBusy === e.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Heart className="h-4 w-4" />
                      )}
                      {mine ? 'Your entry' : voted ? 'Voted' : 'Vote'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void share(e)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-cream ring-1 ring-black/[0.06] transition-all active:scale-95"
                      aria-label={`Share ${e.providerName}'s entry`}
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                  </div>
                  {shared === e.id && <p className="mt-1.5 text-xs text-emerald-600">Link copied. Send it to your voters.</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
