import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(price: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(price)
}

/**
 * Compact price for tight spaces (rate boxes): ₦120,000 → ₦120K,
 * ₦1,500,000 → ₦1.5M. Never truncates with ellipsis.
 */
export function formatCompactPrice(price: number) {
  if (price >= 1_000_000) {
    const m = price / 1_000_000;
    return `₦${m % 1 === 0 ? m.toString() : m.toFixed(1)}M`;
  }
  if (price >= 1_000) {
    const k = price / 1_000;
    return `₦${k % 1 === 0 ? k.toString() : k.toFixed(1)}K`;
  }
  return `₦${price}`;
}

/**
 * TikTok-style compact count: 45200 → 45.2K, 1200000 → 1.2M.
 * For view counts and other traction stats.
 */
export function formatCompactCount(n: number) {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m % 1 === 0 ? m.toString() : m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${k % 1 === 0 ? k.toString() : k.toFixed(1)}K`;
  }
  return n.toString();
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
