/* Intima service worker: minimal offline shell + static cache.
 * Installability (the "Add to Home Screen" prompt) requires a service
 * worker; this one stays lean and never caches authenticated pages. */
const CACHE = 'intima-shell-v1';
const SHELL = ['/', '/icons/icon.svg', '/manifest.webmanifest'];

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
  // Only cache same-origin GETs for static assets and the shell.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((res) => {
        // Cache icons, manifest, and Next static chunks.
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
      }).catch(() => cached);
      return cached || network;
    })
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
        for (const w of wins) {
          if ('focus' in w) { await w.focus(); return; }
        }
        await self.clients.openWindow(url);
      } catch { /* ignore */ }
    })()
  );
});
