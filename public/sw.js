/* Intima service worker: offline shell + Web Push.
 *
 * Strategy: NETWORK-FIRST for everything same-origin. A cache-first
 * static-chunk cache under a fixed cache name previously risked serving
 * code from an old deploy against a new build after an update, which
 * surfaced on devices as "Application error: a client-side exception
 * has occurred". Cached responses are now only an offline fallback,
 * and the cache name is versioned so old caches are purged on activate.
 */
const CACHE = 'intima-shell-v3';
const SHELL = ['/icons/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((res) => {
        // Keep a copy of static assets for offline fallback only.
        if (
          res.ok &&
          (url.pathname.startsWith('/icons/') ||
            url.pathname.startsWith('/_next/static/') ||
            url.pathname === '/manifest.webmanifest')
        ) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request).then((c) => c || caches.match('/')))
  );
});

/* ---- Web Push ---- */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch { /* ignore malformed payloads */ }
  event.waitUntil(
    (async () => {
      try {
        await self.registration.showNotification(data.title || 'Intima', {
          body: data.body || '',
          icon: '/icons/icon.svg',
          badge: '/icons/icon.svg',
          tag: data.tag || 'intima',
          data: { url: data.url || '/' },
        });
      } catch { /* showing must never throw */ }
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      try {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        // Prefer a window already on the target page: just focus it.
        for (const w of wins) {
          try {
            if (new URL(w.url).pathname === new URL(url, self.location.origin).pathname) {
              await w.focus();
              return;
            }
          } catch { /* fall through */ }
        }
        // Otherwise navigate an existing window to the notification's page.
        for (const w of wins) {
          if ('navigate' in w && 'focus' in w) {
            await w.navigate(url);
            await w.focus();
            return;
          }
        }
        await self.clients.openWindow(url);
      } catch { /* ignore */ }
    })()
  );
});
