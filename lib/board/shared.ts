/**
 * Request board constants and validators shared by the server
 * logic and the board page. This module must stay import-free:
 * the page is a client component, and anything that pulls in
 * server modules (payments, crypto) breaks the client build.
 */

export const BOARD_TIMINGS = ['today', 'tomorrow', 'this_weekend', 'flexible'] as const;
export type BoardTiming = (typeof BOARD_TIMINGS)[number];

export const BOARD_TIMING_LABELS: Record<BoardTiming, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  this_weekend: 'This weekend',
  flexible: 'I am flexible',
};

export const BOARD_OPEN_HOURS = 48;
export const BOARD_MIN_RATE = 5000;
export const BOARD_MAX_RATE = 10_000_000;

export function isBoardTiming(v: unknown): v is BoardTiming {
  return typeof v === 'string' && (BOARD_TIMINGS as readonly string[]).includes(v);
}

export function isValidBoardRate(n: unknown): n is number {
  return (
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n >= BOARD_MIN_RATE &&
    n <= BOARD_MAX_RATE
  );
}
