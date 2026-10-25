import { useSyncExternalStore } from 'react'

/**
 * The live set of user ids currently online, fed by Supabase
 * Realtime Presence (a websocket: joining and leaving are
 * seen by everyone in the channel within a second or two).
 * This is the exact layer WhatsApp-style "online" comes
 * from; profiles.last_seen_at remains the record of when
 * someone was last online once they have left, and the map
 * recency buckets remain the coarse fallback for strangers.
 */
let onlineIds: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()

export function setOnlineUserIds(ids: Iterable<string>) {
  onlineIds = new Set(ids)
  for (const fn of [...listeners]) fn()
}

export function clearOnlineUserIds() {
  setOnlineUserIds([])
}

/** Imperative read for non-React surfaces (map pins). */
export function isOnlineNow(userId: string | null | undefined): boolean {
  return userId ? onlineIds.has(userId) : false
}

export function subscribeOnline(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useIsOnline(userId: string | null | undefined): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => (userId ? onlineIds.has(userId) : false),
    () => false,
  )
}
