'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { companionShareLink, referralLink, shareLink } from '@/lib/links';
import { getSetting } from '@/lib/settings/platformSettings';
import { coinsWithNgn } from '@/lib/utils/helpers';
import { showToast } from '@/lib/toast';
import { HelpTip } from '@/components/ui/Tooltip';
import { Check, Copy, Share2 } from '@/lib/icons';

interface FriendRow {
  id: string;
  name: string;
  joinedAt: string;
  paidCoins: number | null;
}

/**
 * Your referral link, with copy and share, plus the honest state
 * of everyone who joined through it. The reward rule it renders:
 * you earn when a friend who joined through your link opens their
 * first paid connection, 500 coins for a companion referrer, 100
 * for a client (lib/payments/settleConnection.ts). Self-contained:
 * fetches its own profile, rewards and referees.
 */
type ClaimStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'claiming';

export function ReferralCard() {
  const [link, setLink] = useState<string | null>(null);
  const [noUsername, setNoUsername] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rewardCompanion, setRewardCompanion] = useState(500);
  const [rewardClient, setRewardClient] = useState(100);
  const [claimName, setClaimName] = useState('');
  const [claimStatus, setClaimStatus] = useState<ClaimStatus>('idle');
  const [claimReason, setClaimReason] = useState('');

  useEffect(() => {
    getSetting<number>('referral_reward_companion_coins', 500).then((v) => { if (typeof v === 'number') setRewardCompanion(v); }).catch(() => {});
    getSetting<number>('referral_reward_client_coins', 100).then((v) => { if (typeof v === 'number') setRewardClient(v); }).catch(() => {});
  }, []);
  const supabase = createClient();

  useEffect(() => {
    let live = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, role')
        .eq('id', user.id)
        .maybeSingle();
      const username = (profile as { username?: string } | null)?.username ?? null;
      if (live) setRole((profile as { role?: string } | null)?.role ?? null);
      if (!username) {
        if (live) { setNoUsername(true); setLoading(false); }
        return;
      }
      if (live) {
        setLink(
          profile?.role === 'model'
            ? companionShareLink(username)
            : referralLink(username),
        );
      }
      const [{ data: rewards }, { data: joined }] = await Promise.all([
        supabase.from('referral_rewards')
          .select('referee_id, coins, created_at')
          .eq('referrer_id', user.id),
        supabase.from('profiles')
          .select('id, display_name, username, created_at')
          .eq('referred_by', username)
          .order('created_at', { ascending: false })
          .limit(25),
      ]);
      if (!live) return;
      const paidBy = new Map<string, number>();
      for (const r of (rewards ?? []) as any[]) paidBy.set(r.referee_id, r.coins ?? 0);
      const rows: FriendRow[] = ((joined ?? []) as any[]).map((p) => ({
        id: p.id,
        name: p.display_name || (p.username ? `@${p.username}` : 'A friend'),
        joinedAt: p.created_at,
        paidCoins: paidBy.get(p.id) ?? null,
      }));
      // Friends whose reward landed but who are missing from the
      // joined list (older attribution) still get a row.
      const known = new Set(rows.map((r) => r.id));
      for (const r of (rewards ?? []) as any[]) {
        if (!known.has(r.referee_id)) {
          rows.push({ id: r.referee_id, name: 'A friend', joinedAt: r.created_at, paidCoins: r.coins ?? 0 });
        }
      }
      setFriends(rows);
      setLoading(false);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live availability check while the member types a username.
  useEffect(() => {
    if (!noUsername) return;
    const name = claimName.trim().toLowerCase();
    if (!name) { setClaimStatus('idle'); setClaimReason(''); return; }
    setClaimStatus('checking');
    let live = true;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/profile/username?check=${encodeURIComponent(name)}`);
        const json = await res.json().catch(() => ({}));
        if (!live) return;
        if (json.available) {
          setClaimStatus('available');
          setClaimReason('');
        } else {
          setClaimStatus('unavailable');
          setClaimReason(json.reason ?? 'That username cannot be used. Try another.');
        }
      } catch {
        if (!live) return;
        setClaimStatus('unavailable');
        setClaimReason('We could not check that username just now. Please try again.');
      }
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [claimName, noUsername]);

  async function claim() {
    const name = claimName.trim().toLowerCase();
    if (!name || claimStatus === 'claiming') return;
    setClaimStatus('claiming');
    try {
      const res = await fetch('/api/profile/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setClaimStatus('unavailable');
        setClaimReason(json.error ?? 'Something went wrong. Please try again.');
        return;
      }
      const claimed = (json.username as string) ?? name;
      setLink(role === 'model' ? companionShareLink(claimed) : referralLink(claimed));
      setNoUsername(false);
      showToast('Username claimed. Your referral link is ready.');
    } catch {
      setClaimStatus('unavailable');
      setClaimReason('Something went wrong. Please try again.');
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy. Long-press the link to copy it.');
    }
  }

  async function share() {
    if (!link) return;
    const how = await shareLink({
      url: link,
      title: 'Join me on Intima',
      text: 'Join Intima with my link: verified companions, no agents, direct chat.',
    });
    if (how === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-11 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-neutral-100" />
      </div>
    );
  }

  if (noUsername) {
    return (
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium text-charcoal">
          Pick your username to unlock your referral link
          <HelpTip text="Your username becomes your share link and your Intima profile handle. You pick it once, and it cannot be changed later, so choose one you like." />
        </p>
        <p className="mt-1 text-sm leading-relaxed text-neutral-500">
          Your referral link needs a username. It also sits on your profile as your handle, like @adaeze.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center rounded-2xl bg-cream px-4 ring-1 ring-black/[0.05] focus-within:ring-2 focus-within:ring-primary/40">
            <span className="shrink-0 text-sm font-medium text-neutral-400">@</span>
            <input
              value={claimName}
              onChange={(e) => setClaimName(e.target.value)}
              placeholder="yourname"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={24}
              aria-label="Your username"
              className="min-w-0 flex-1 bg-transparent px-1 py-3 text-sm font-medium text-charcoal outline-none placeholder:text-neutral-400"
            />
          </div>
          <button
            type="button"
            onClick={claim}
            disabled={claimStatus !== 'available'}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {claimStatus === 'claiming' ? 'Claiming...' : 'Claim username'}
          </button>
        </div>
        <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-xs">
          {claimStatus === 'checking' && <span className="text-neutral-400">Checking availability...</span>}
          {claimStatus === 'available' && (
            <span className="font-medium text-emerald-600">@{claimName.trim().toLowerCase()} is available.</span>
          )}
          {claimStatus === 'unavailable' && <span className="font-medium text-red-600">{claimReason}</span>}
        </p>
      </div>
    );
  }

  if (!link) return null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate rounded-2xl bg-cream px-4 py-3 text-sm font-medium text-charcoal ring-1 ring-black/[0.05]">
          {link}
        </p>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy your referral link"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.08] transition-all active:scale-95"
        >
          {copied ? <Check aria-hidden className="h-4 w-4 text-emerald-600" /> : <Copy aria-hidden className="h-4 w-4 text-charcoal" />}
        </button>
        <button
          type="button"
          onClick={share}
          aria-label="Share your referral link"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-all active:scale-95"
        >
          <Share2 aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-neutral-500">
        You earn when a friend joins with your link and opens their first paid connection:{' '}
        {coinsWithNgn(rewardCompanion)} if you are a companion, {coinsWithNgn(rewardClient)} as a client.
      </p>
      {friends.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {friends.slice(0, 10).map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-charcoal">{f.name}</span>
              {f.paidCoins !== null ? (
                <span className="shrink-0 font-semibold text-emerald-600">
                  Reward paid · {coinsWithNgn(f.paidCoins)}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-neutral-400">
                  Joined {new Date(f.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · no connection yet
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
