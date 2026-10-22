'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { companionShareLink, referralLink, shareLink } from '@/lib/links';
import { coinsWithNgn } from '@/lib/utils/helpers';
import { showToast } from '@/lib/toast';
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
export function ReferralCard() {
  const [link, setLink] = useState<string | null>(null);
  const [noUsername, setNoUsername] = useState(false);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
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
      <p className="text-sm text-neutral-500">
        Your referral link needs a username. Yours is being set up; check back shortly.
      </p>
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
        {coinsWithNgn(500)} if you are a companion, {coinsWithNgn(100)} as a client.
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
