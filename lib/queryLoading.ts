// Tiny in-flight query counter, modelled on lib/toast.ts.
// The Supabase browser client routes every request through the
// tracked fetch wrapper in lib/supabase/client.ts, which calls
// beginQuery/endQuery around each request, so the global loading
// widget (components/shared/QueryLoadingWidget.tsx) lights up for
// background fetches app-wide without pages opting in one by one.
type Listener = (count: number) => void

let count = 0
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((l) => l(count))
}

export function beginQuery() {
  count += 1
  emit()
}

export function endQuery() {
  count = Math.max(0, count - 1)
  emit()
}

export function getQueryCount() {
  return count
}

export function subscribeQueryLoading(l: Listener) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
