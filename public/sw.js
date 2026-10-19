/* Intima service worker: minimal offline shell + static cache.
 * Installability (the "Add to Home Screen" prompt) requires a service
 * worker; this one stays lean and never caches authenticated pages. */
const CACHE = 'intima-shell-v1';
const SHELL = ['/', '/icons/icon-192.png', '/icons/icon-512.png', '/manifest.webmanifest'];

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
