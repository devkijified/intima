import { useSyncExternalStore } from 'react'

/**
 * The live set of user ids currently online, fed by Supabase
 * Realtime Presence (a websocket: joining and leaving are
 * seen by everyone in the channel within a second or two).
 * This is the exact layer WhatsApp-style "online" comes
 * from; profiles.last_seen_at remains the record of when
 * someone was last online once they have left.
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

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useIsOnline(userId: string | null | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? onlineIds.has(userId) : false),
    () => false,
  )
}
