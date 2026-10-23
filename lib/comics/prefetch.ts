/**
 * Background panel loader for the comic reader.
 *
 * The reader's opening gate only waits for the first screen of
 * panels; before this loader existed the rest arrived lazily as
 * the reader scrolled, so a fast reader on a slow connection kept
 * hitting loading spinners mid-episode. This queue pulls the whole
 * current episode down in the background (then the next episode,
 * enqueued after it), a few panels at a time, into the same cache
 * the panel images render from (the service worker's panel cache
 * plus the HTTP cache). By the time the reader scrolls there, the
 * pages are already on the device: an almost offline feel.
 *
 * Module level on purpose: the queue and the done set survive
 * client-side episode changes, so stepping into the next episode
 * never restarts a download that already finished.
 */

const MAX_CONCURRENT = 3;
// A panel request that hangs (a proxy or source CDN keeping the
// connection open with no answer) must never hold its slot for
// good: after the timeout the slot frees and the queue moves on.
// The panel itself is not lost, it simply loads on demand when
// the reader reaches it, like panels always did.
const PANEL_TIMEOUT_MS = 20_000;

const done = new Set<string>();
const queued = new Set<string>();
const queue: string[] = [];
let active = 0;

function drain() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const url = queue.shift() as string;
    active += 1;
    const img = new Image();
    img.decoding = 'async';
    try {
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
    } catch {
      /* older engines: the queue order still does the job */
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      done.add(url);
      queued.delete(url);
      active -= 1;
      drain();
    };
    const watchdog = window.setTimeout(() => {
      img.src = '';
      finish();
    }, PANEL_TIMEOUT_MS);
    img.onload = img.onerror = () => {
      window.clearTimeout(watchdog);
      finish();
    };
    img.src = url;
  }
}

/**
 * Enqueue panel URLs for background download, in reading order.
 * Already downloaded or already queued URLs are skipped.
 */
export function prefetchPanels(urls: readonly string[]): void {
  if (typeof window === 'undefined') return;
  let added = false;
  for (const url of urls) {
    if (!url || done.has(url) || queued.has(url)) continue;
    queued.add(url);
    queue.push(url);
    added = true;
  }
  if (added) drain();
}

/** True when the reader's connection asks to save data. */
export function isSaveData(): boolean {
  try {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return conn?.saveData === true;
  } catch {
    return false;
  }
}
