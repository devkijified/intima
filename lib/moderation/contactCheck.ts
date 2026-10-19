/**
 * Contact-info leak detection. Catches Nigerian phone numbers in public
 * text (story captions, etc.) to discourage off-platform contact.
 *
 * This is a deterrent, not a wall: it stops the casual cases. Determined
 * users will spell numbers out, and no regex catches that. The real
 * defense is platform economics (gifts, verification, reviews).
 */

/** Matches Nigerian mobile numbers: 08031234567, +2348031234567, 0803 123 4567, etc. */
const NIGERIAN_PHONE =
  /(?:\+?234|0)[\s.-]?([789][01]\d)[\s.-]?(\d{3})[\s.-]?(\d{4})/;

/** Matches generic long digit runs that look like phone numbers. */
const DIGIT_RUN = /(?:\d[\s.-]?){10,}/;

export function containsPhoneNumber(text: string): boolean {
  if (!text) return false;
  return NIGERIAN_PHONE.test(text) || DIGIT_RUN.test(text);
}

export const CONTACT_WARNING =
  'Phone numbers are not allowed in public posts. Clients contact you through Intima after paying the connection fee.';
