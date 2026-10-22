/**
 * Perks contests: shared phase + prize math.
 *
 * A contest has one live window (starts_at..ends_at): companions
 * enter with one photo or one short video and members vote inside
 * the same window. That
 * is deliberate: contestants share their entry link while voting is
 * live, which is what pulls new people in. Entries are human
 * approved before they can be seen or voted on.
 */

export type ContestPhase = 'upcoming' | 'live' | 'ended' | 'paid';

export interface ContestLike {
  status: string;
  starts_at: string;
  ends_at: string;
}

export function contestPhase(c: ContestLike, now = new Date()): ContestPhase {
  if (c.status === 'paid') return 'paid';
  if (c.status === 'closed') return 'ended';
  const t = now.getTime();
  if (t < new Date(c.starts_at).getTime()) return 'upcoming';
  if (t > new Date(c.ends_at).getTime()) return 'ended';
  return 'live';
}

export function phaseCopy(phase: ContestPhase): string {
  switch (phase) {
    case 'upcoming':
      return 'Opens soon';
    case 'live':
      return 'Live now';
    case 'ended':
      return 'Ended, winners being confirmed';
    case 'paid':
      return 'Winners paid';
  }
}

/**
 * Prize per place from a percentage split, e.g. [60, 25, 15].
 * Rounding remainder goes to first place so the total always
 * matches the advertised prize.
 */
export function prizeForPlace(totalCoins: number, split: number[], place: number): number {
  if (place < 1 || place > split.length || totalCoins <= 0) return 0;
  let paid = 0;
  let mine = 0;
  split.forEach((pct, i) => {
    const amt = i === 0 ? 0 : Math.floor((totalCoins * pct) / 100);
    if (i > 0) paid += amt;
    if (i + 1 === place) mine = amt;
  });
  if (place === 1) {
    const first = Math.floor((totalCoins * (split[0] ?? 100)) / 100);
    return totalCoins - paid > first ? totalCoins - paid : first;
  }
  return mine;
}
