/**
 * Gift categories for the store sheet, following the owner's own
 * 50-type groupings (2026-10-21). The panel's chip row is: All,
 * Favourites, Recent, then these categories, then Premium (the
 * animated stage and takeover gifts, wherever they live).
 */
export type GiftCategoryKey =
  | 'essentials'
  | 'vibrators'
  | 'internal'
  | 'anal'
  | 'for-him'
  | 'bdsm'

export const GIFT_CATEGORY_CHIPS: Array<{ key: GiftCategoryKey; label: string }> = [
  { key: 'essentials', label: 'Essentials' },
  { key: 'vibrators', label: 'Vibrators' },
  { key: 'internal', label: 'Internal' },
  { key: 'anal', label: 'Anal' },
  { key: 'for-him', label: 'For Him' },
  { key: 'bdsm', label: 'BDSM' },
]

export const GIFT_CATEGORY_OF: Record<string, GiftCategoryKey> = {
  condom: 'essentials',
  lube: 'essentials',
  rose: 'vibrators',
  lipstick: 'vibrators',
  wand: 'vibrators',
  rabbit: 'vibrators',
  bullet: 'vibrators',
  'air-pulse': 'vibrators',
  suction: 'vibrators',
  butterfly: 'vibrators',
  'finger-vibe': 'vibrators',
  'egg-remote': 'vibrators',
  'panty-vibe': 'vibrators',
  tongue: 'vibrators',
  gspot: 'vibrators',
  egg: 'vibrators',
  dildo: 'internal',
  'glass-dildo': 'internal',
  'metal-dildo': 'internal',
  'suction-cup-dildo': 'internal',
  'strap-on': 'internal',
  'double-dildo': 'internal',
  'thrusting-dildo': 'internal',
  'inflatable-dildo': 'internal',
  chest: 'internal',
  'golden-rose': 'vibrators',
  'anal-beads': 'anal',
  'butt-plug': 'anal',
  'vibe-plug': 'anal',
  prostate: 'anal',
  'inflatable-plug': 'anal',
  'glass-plug': 'anal',
  'weighted-plug': 'anal',
  'ring-plug': 'anal',
  'remote-plug': 'anal',
  'anal-hook': 'anal',
  sleeve: 'for-him',
  'stroker-case': 'for-him',
  'stroker-machine': 'for-him',
  fleshlight: 'for-him',
  'masturbator-egg': 'for-him',
  'cock-ring': 'for-him',
  ring: 'for-him',
  'triple-ring': 'for-him',
  'ball-stretcher': 'for-him',
  'prostate-wand': 'for-him',
  chains: 'bdsm',
  'wrist-cuffs': 'bdsm',
  'nipple-clamps': 'bdsm',
  'vibe-nipple-clamps': 'bdsm',
  'nipple-suckers': 'bdsm',
  paddle: 'bdsm',
  flogger: 'bdsm',
  pinwheel: 'bdsm',
  blindfold: 'bdsm',
  ruler: 'bdsm',
  'bondage-tape': 'bdsm',
}
