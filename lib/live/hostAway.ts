/**
 * Host-away rules, shared by the room, the studio and the
 * /api/live/away route.
 *
 * When the host steps away (their participant leaves the
 * room), viewers see a countdown from AWAY_GRACE_SECONDS. If
 * the host is not back when it runs out, the live ends for
 * everyone. The stamp lives on the session row (away_since),
 * written by the server, so every viewer counts the same
 * clock down.
 */
export const AWAY_GRACE_SECONDS = 300

/**
 * Pronouns for the away copy, from the host's profile gender.
 * Null when unset: the copy then uses the host's name and no
 * pronoun at all, rather than guessing. (The first version of
 * the overlay hardcoded 'She' for every host, the owner
 * included; that is what this fixes.)
 */
export function pronounsForGender(
  gender: string | null | undefined,
): { subject: string; possessive: string; possessiveMid: string } | null {
  if (gender === 'female') return { subject: 'She', possessive: 'Her', possessiveMid: 'her' }
  if (gender === 'male') return { subject: 'He', possessive: 'His', possessiveMid: 'his' }
  return null
}

/** "4:37" from a remaining-seconds count, floored at zero. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
