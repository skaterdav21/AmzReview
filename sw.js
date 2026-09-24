// Network-first service worker: always serves the latest site when online, and the last copy when offline.
// Its presence also lets Android install the app so it can appear in the share menu.
const CACHE = 'review-sprint-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); }
        return response;
      })
      // Shared links arrive as ?url=… so fall back to the cached page regardless of the query string.
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
