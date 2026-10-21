'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { showToast } from '@/lib/toast';

interface SubState {
  status: string;
  cancelled: boolean;
  current_period_end: string;
}

interface SubscribeCardProps {
  providerId: string;
  providerName: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Fan club card for a companion profile. Renders nothing when the
 * provider has not set a fan club price (price null or 0). Handles
 * subscribe (coins, via /api/subscriptions) and cancel; perks run to
 * current_period_end either way.
 */
export function SubscribeCard({ providerId, providerName }: SubscribeCardProps) {
  const [loading, setLoading] = useState(true);
  const [priceCoins, setPriceCoins] = useState<number | null>(null);
  const [sub, setSub] = useState<SubState | null>(null);
  const [busy, setBusy] = useState(false);
  const [needCoins, setNeedCoins] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = async (initial = false) => {
    try {
      const res = await fetch(
        `/api/subscriptions?provider_id=${encodeURIComponent(providerId)}`
      );
      if (!res.ok) return;
      const j = await res.json();
      setPriceCoins(typeof j.priceCoins === 'number' ? j.priceCoins : null);
      setSub(j.subscription ?? null);
    } catch {
      /* fan club card is best effort */
    } finally {
      if (initial) setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  // Every instance of this card on the page stays in sync: subscribing
  // from the profile card must flip the copy inside the Private tab
  // too, and the other way round.
  useEffect(() => {
    const onChange = () => {
      void loadStatus();
    };
    window.addEventListener('intima:subscription-changed', onChange);
    return () =>
      window.removeEventListener('intima:subscription-changed', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  if (loading || !priceCoins || priceCoins <= 0) return null;

  const subscribe = async () => {
    if (busy) return;
    setBusy(true);
    setNeedCoins(false);
    setError('');
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: providerId }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) {
        showToast('Log in to join the fan club');
        window.location.href = '/login';
        return;
      }
      if (res.status === 402) {
        setNeedCoins(true);
        return;
      }
      if (!res.ok) {
        setError(j.error || 'Could not subscribe. Please try again.');
        return;
      }
      if (j.subscription) {
        setSub({
          status: 'active',
          cancelled: false,
          current_period_end: j.subscription.current_period_end,
        });
        window.dispatchEvent(new CustomEvent('intima:subscription-changed'));
      }
    } catch {
      setError('Could not subscribe. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_id: providerId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || 'Could not cancel. Please try again.');
        return;
      }
      setSub((prev) => (prev ? { ...prev, cancelled: true } : prev));
      window.dispatchEvent(new CustomEvent('intima:subscription-changed'));
    } catch {
      setError('Could not cancel. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-luxe mt-4 p-4">
      <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-neutral-400">
        Fan club
      </p>
      {sub ? (
        <>
          <p className="mt-2 text-sm text-charcoal">
            You are in the fan club until {fmtDate(sub.current_period_end)}
          </p>
          {sub.cancelled ? (
            <p className="mt-1 text-xs text-neutral-500">
              Cancelled. Your access runs until {fmtDate(sub.current_period_end)}.
            </p>
          ) : (
            <>
              <button
                onClick={cancel}
                disabled={busy}
                className="mt-3 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-neutral-600 shadow-soft ring-1 ring-black/[0.08] transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? 'Cancelling...' : 'Cancel subscription'}
              </button>
              <p className="mt-2 text-xs text-neutral-400">
                Cancelling keeps your access until {fmtDate(sub.current_period_end)}.
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-charcoal">
            Join the fan club for {priceCoins.toLocaleString()} coins a month
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Fan club members get a Fan badge in chat and access to subscribers only
            stories from {providerName}.
          </p>
          <button
            onClick={subscribe}
            disabled={busy}
            className="btn-luxe mt-3 px-5 py-2.5 text-[13px] disabled:opacity-50"
          >
            {busy ? 'Subscribing...' : 'Subscribe'}
          </button>
          {needCoins && (
            <p className="mt-2 text-sm text-red-600">
              Not enough coins.{' '}
              <Link href="/coins" className="font-semibold text-primary underline">
                Top up your coins
              </Link>
            </p>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
