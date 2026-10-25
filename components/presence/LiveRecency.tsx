'use client'

import { useIsOnline } from '@/lib/presence/online'

/**
 * The map recency line with the live layer on top: when the
 * presence websocket says this companion is in the app right
 * now, the coarse bucket ("Active today", from her presence
 * row) is replaced by an exact "Online now". Used by the
 * server-rendered public profile, where the bucket is
 * computed on the server and only this line can go live.
 */
export function LiveRecency({
  providerId,
  fallback,
}: {
  providerId: string
  fallback: string | null
}) {
  const online = useIsOnline(providerId)
  if (online) {
    return (
      <span className="flex items-center gap-1 font-medium text-green-700">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
        Online now
      </span>
    )
  }
  if (!fallback) return null
  return <span className="text-neutral-500">{fallback}</span>
}
