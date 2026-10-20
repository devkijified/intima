/**
 * Gift visual, emoji-free by standing rule: a tier-gradient disc with
 * the gift's initial in Fraunces. Consistent across the gift sheet,
 * the toast feed, and the mega-gift takeover.
 * Tiers: basic = burgundy, premium = plum-dark, luxury = charcoal+gold,
 * mega = full gold.
 */
const TIER_STYLES: Record<string, string> = {
  basic: 'bg-gradient-to-br from-[#C2436B] to-[#AC244D] text-white',
  premium: 'bg-gradient-to-br from-[#5B2A4A] to-[#33182C] text-gold',
  luxury: 'bg-gradient-to-br from-[#2B2B2B] to-[#121212] text-gold ring-1 ring-gold/50',
  mega: 'bg-gradient-to-br from-[#E7CE8C] via-[#C9A84C] to-[#9A7B2D] text-[#231a04]',
};

const SIZES = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-11 w-11 text-lg',
  lg: 'h-14 w-14 text-2xl',
  mega: 'h-36 w-36 text-7xl shadow-gold',
} as const;

export function GiftGlyph({
  name,
  tier,
  size = 'md',
}: {
  name: string;
  tier?: string | null;
  size?: keyof typeof SIZES;
}) {
  const style = TIER_STYLES[tier ?? 'basic'] ?? TIER_STYLES.basic;
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-semibold ${style} ${SIZES[size]}`}
    >
      {(name || 'G').charAt(0).toUpperCase()}
    </span>
  );
}
