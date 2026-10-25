import { useSyncExternalStore } from 'react'

/**
 * The live set of user ids currently online, fed by Supabase
 * Realtime Presence (a websocket: joining and leaving are
 * seen by everyone in the channel within a second or two).
 * This is the exact layer WhatsApp-style "online" comes
 * from; profiles.last_seen_at remains the record of when
 * someone was last online once they have left, and the map
 * recency buckets remain the coarse fallback for strangers.
 *
 * The state lives on a window-global, not in module scope:
 * Next can bundle this module into more than one chunk (the
 * layout graph and a page graph), and two module copies mean
 * two stores, the writer filling one while the readers watch
 * the other. That split is exactly what bit the map: the
 * presence frames arrived, the sync handler ran, and the
 * pins and sheets still never lit. One backing object on
 * window makes the split impossible.
 */
interface PresenceStore {
  ids: ReadonlySet<string>
  listeners: Set<() => void>
}

const serverStore: PresenceStore = { ids: new Set(), listeners: new Set() }

function getStore(): PresenceStore {
  if (typeof window === 'undefined') return serverStore
  const w = window as unknown as { __intimaPresenceStore?: PresenceStore }
  if (!w.__intimaPresenceStore) {
    w.__intimaPresenceStore = { ids: new Set(), listeners: new Set() }
  }
  return w.__intimaPresenceStore
}

export function setOnlineUserIds(ids: Iterable<string>) {
  const store = getStore()
  store.ids = new Set(ids)
  for (const fn of [...store.listeners]) fn()
}

export function clearOnlineUserIds() {
  setOnlineUserIds([])
}

/**
 * Map providers carry a display id prefixed with 'db-' (the
 * map layer separates database rows from mock previews that
 * way); presence is keyed by the raw profile id. Strip the
 * prefix here, in the one place every reader passes through,
 * so a map surface can hand over its display id and still
 * match. A real profile id never has a hyphen at index 2 (its
 * first hyphen sits at index 8), so the strip cannot misfire.
 */
function normalizeId(userId: string): string {
  return userId.startsWith('db-') ? userId.slice(3) : userId
}

/** Imperative read for non-React surfaces (map pins). */
export function isOnlineNow(userId: string | null | undefined): boolean {
  return userId ? getStore().ids.has(normalizeId(userId)) : false
}

export function subscribeOnline(fn: () => void) {
  const store = getStore()
  store.listeners.add(fn)
  return () => {
    store.listeners.delete(fn)
  }
}

export function useIsOnline(userId: string | null | undefined): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => (userId ? getStore().ids.has(normalizeId(userId)) : false),
    () => false,
  )
}
