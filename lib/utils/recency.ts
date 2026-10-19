/**
 * Recency buckets for the "last active" trust chips (Tryst-style).
 * Coarse on purpose: strangers see "Active today", never exact times.
 */

export function formatRecency(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const hours = (Date.now() - then) / 3_600_000;
  if (hours < 0) return null;
  if (hours < 24) return 'Active today';
  if (hours < 48) return 'Active yesterday';
  if (hours < 24 * 7) return `Active ${Math.floor(hours / 24)}d ago`;
  return null; // stale: no chip is more honest than "Active 3w ago"
}
