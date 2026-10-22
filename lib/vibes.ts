/**
 * Companion vibe tags: the short personality and style labels a
 * companion picks for her profile ("420 Friendly", "Rimming",
 * "Party Girl"). The preset list is admin-editable (platform
 * setting 'preset_vibes'); these defaults ship with the app and
 * are what the admin editor opens with. A companion may also add
 * her own in her own words, stored the same way in profiles.vibes
 * and held to the custom rules below.
 */
export const DEFAULT_VIBES: string[] = [
  '420 Friendly',
  'Rimming',
  'Fetish Friendly',
  'Kink Friendly',
  'Role Play',
  'Couples Welcome',
  'Party Girl',
  'Low Volume',
  'High Class',
  'Girl Next Door',
  'Outcalls Only',
  'Incalls Available',
];

export const MAX_VIBES = 8;
export const CUSTOM_VIBE_MIN_LENGTH = 2;
export const CUSTOM_VIBE_MAX_LENGTH = 30;

/** Why a custom vibe cannot be saved, or null when it is fine. */
export function customVibeProblem(text: string): string | null {
  const t = text.trim();
  if (t.length < CUSTOM_VIBE_MIN_LENGTH) {
    return `A vibe needs at least ${CUSTOM_VIBE_MIN_LENGTH} characters.`;
  }
  if (t.length > CUSTOM_VIBE_MAX_LENGTH) {
    return `Keep a vibe under ${CUSTOM_VIBE_MAX_LENGTH} characters.`;
  }
  return null;
}
