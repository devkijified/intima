/**
 * Coin packages: 1 coin = ₦10 (NegoEmpire-proven local model).
 */
export const COIN_PACKAGES = [
  { id: 'starter', coins: 100, priceNgn: 1000, label: 'Starter' },
  { id: 'popular', coins: 500, priceNgn: 5000, label: 'Popular' },
  { id: 'premium', coins: 1000, priceNgn: 10000, label: 'Premium' },
  { id: 'whale', coins: 5000, priceNgn: 50000, label: 'Whale' },
] as const;

export type CoinPackageId = (typeof COIN_PACKAGES)[number]['id'];
