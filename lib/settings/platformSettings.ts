import { createClient } from '@/lib/supabase/client'

/**
 * Platform settings are the single source of truth for every important
 * tunable in the app (connection fee, verification SLA, photo limits...).
 * Nothing user-facing reads a hardcoded number when a setting exists.
 *
 * Values are cached in memory for 60 seconds so settings reads stay
 * cheap on mobile data. The cache is best effort: any failure falls
 * back to the provided default, never to a crash.
 */

interface CacheEntry {
  value: unknown
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const TTL_MS = 60_000

/** Fallback used only when the settings row cannot be read. */
export const DEFAULT_CONNECTION_FEE_NGN = 5000

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T
  }

  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', key)
      .single()

    if (error || !data || data.value === null || data.value === undefined) {
      return fallback
    }

    const value = data.value as T
    cache.set(key, { value, expiresAt: Date.now() + TTL_MS })
    return value
  } catch {
    return fallback
  }
}

/**
 * The live connection fee in naira, read from platform settings.
 * Falls back to DEFAULT_CONNECTION_FEE_NGN only when the row is missing.
 */
export async function getConnectionFeeNgn(): Promise<number> {
  const raw = await getSetting<number | null>(
    'connection_fee_ngn',
    DEFAULT_CONNECTION_FEE_NGN
  )
  return typeof raw === 'number' && raw >= 0
    ? raw
    : DEFAULT_CONNECTION_FEE_NGN
}

/** Clear the in-memory cache (useful after an admin saves a setting). */
export function clearSettingsCache(): void {
  cache.clear()
}
