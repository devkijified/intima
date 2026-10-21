// Global toast store. The host component lives in the root layout,
// which never unmounts during in-app navigation, so a toast raised
// right before a redirect (for example "Log in to start a voice
// call" on a profile page) is still on screen when the login or
// signup page lands. For full page reloads (window.location), the
// message is stashed in sessionStorage and the host picks it up on
// the next page when it is still fresh.

export type ToastMsg = { id: number; message: string }

type Listener = (t: ToastMsg | null) => void

const STASH_KEY = 'intima_pending_toast'
const STASH_FRESH_MS = 8000

let current: ToastMsg | null = null
let seq = 0
const listeners = new Set<Listener>()

export function showToast(message: string) {
  seq += 1
  current = { id: seq, message }
  try {
    sessionStorage.setItem(STASH_KEY, JSON.stringify({ message, at: Date.now() }))
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l(current))
}

export function subscribeToast(l: Listener) {
  listeners.add(l)
  l(current)
  return () => {
    listeners.delete(l)
  }
}

// Read and clear a toast stashed before a full page reload. Returns
// null when there is none or it is too old to still be relevant.
export function takeStashedToast(): string | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY)
    if (!raw) return null
    sessionStorage.removeItem(STASH_KEY)
    const parsed = JSON.parse(raw) as { message?: string; at?: number }
    if (parsed.message && typeof parsed.at === 'number' && Date.now() - parsed.at < STASH_FRESH_MS) {
      return parsed.message
    }
  } catch {
    /* storage unavailable */
  }
  return null
}
