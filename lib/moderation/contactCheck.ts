/**
 * Contact-info leak detection for companion content.
 * Catches phone numbers, social handles, and messaging app references
 * in public text (posts, captions, bios) to protect platform revenue.
 *
 * This is a deterrent, not a wall: it stops the casual cases. Determined
 * users will spell numbers out, and no regex catches that. The real
 * defense is platform economics (gifts, verification, reviews).
 */

/** Nigerian mobile: 08031234567, +2348031234567, 0803 123 4567, etc. */
const NIGERIAN_PHONE =
  /(?:\+?234|0)[\s.-]?([789][01]\d)[\s.-]?(\d{3})[\s.-]?(\d{4})/;

/** Generic long digit runs that look like phone numbers. */
const DIGIT_RUN = /(?:\d[\s.-]?){10,}/;

/** Spelled-out digits: "zero eight zero three..." (basic catch). */
const SPELLED_DIGITS =
  /(zero|one|two|three|four|five|six|seven|eight|nine)(\s+(zero|one|two|three|four|five|six|seven|eight|nine)){5,}/i;

/** Instagram: @handle, instagram.com/handle, "ig:", "my ig". */
const INSTAGRAM =
  /(@[a-zA-Z0-9._]{2,30}|instagram\.com\/[a-zA-Z0-9._]+|\big\b\s*[:\-]?\s*[@a-zA-Z0-9._]+|my\s+ig\b)/i;

/** WhatsApp: wa.me links, "whatsapp", "chat me up". */
const WHATSAPP = /(wa\.me\/|whatsapp|chat\s+me\s+up|dm\s+me\s+on\s+whatsapp)/i;

/** Telegram: t.me links, "telegram". */
const TELEGRAM = /(t\.me\/|telegram)/i;

/** Snapchat: "snapchat", "snap:". */
const SNAPCHAT = /(snapchat|\bsnap\s*[:\-])/i;

/** Email addresses. */
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

export type LeakType =
  | 'phone'
  | 'instagram'
  | 'whatsapp'
  | 'telegram'
  | 'snapchat'
  | 'email';

export interface LeakResult {
  clean: boolean;
  leaks: LeakType[];
}

/** Returns every leak type found in the text. */
export function scanForLeaks(text: string): LeakResult {
  if (!text) return { clean: true, leaks: [] };
  const leaks: LeakType[] = [];
  if (NIGERIAN_PHONE.test(text) || DIGIT_RUN.test(text) || SPELLED_DIGITS.test(text)) {
    leaks.push('phone');
  }
  if (INSTAGRAM.test(text)) leaks.push('instagram');
  if (WHATSAPP.test(text)) leaks.push('whatsapp');
  if (TELEGRAM.test(text)) leaks.push('telegram');
  if (SNAPCHAT.test(text)) leaks.push('snapchat');
  if (EMAIL.test(text)) leaks.push('email');
  return { clean: leaks.length === 0, leaks };
}

/** Backwards-compatible: true if any phone-like content. */
export function containsPhoneNumber(text: string): boolean {
  return scanForLeaks(text).leaks.includes('phone');
}

export const CONTACT_WARNING =
  'Contact details are not allowed in public posts. Clients reach you through Intima after paying the connection fee.';

export function leakWarning(leaks: LeakType[]): string {
  const labels: Record<LeakType, string> = {
    phone: 'phone numbers',
    instagram: 'Instagram handles',
    whatsapp: 'WhatsApp references',
    telegram: 'Telegram references',
    snapchat: 'Snapchat references',
    email: 'email addresses',
  };
  return `We spotted ${leaks.map((l) => labels[l]).join(', ')} in your post. ${CONTACT_WARNING}`;
}
