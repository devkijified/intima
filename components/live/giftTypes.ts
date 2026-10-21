/**
 * Shared gift catalog types (gift_catalog, migration 016 + 060).
 * `tier` is the legacy 016 vocabulary used for glyph styling;
 * `anim_tier` (060) is what the animation engine keys off.
 */
export type GiftTier = 'basic' | 'premium' | 'luxury' | 'mega'
export type GiftAnimTier = 'float' | 'burst' | 'stage' | 'takeover'

export interface GiftCatalogItem {
  id: string
  name: string
  emoji: string
  coin_cost: number
  tier: GiftTier
  anim_tier: GiftAnimTier
  is_active?: boolean
}

/** One gift event as the FX engine consumes it (built from a
 * gift_transactions realtime row plus the resolved catalog entry). */
export interface GiftFxEvent {
  id: string
  giftId: string
  name: string
  emoji: string
  animTier: GiftAnimTier
  coinCost: number
  senderId: string
  senderName: string
}
