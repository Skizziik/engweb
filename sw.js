/**
 * Service worker — network-first caching.
 *
 * Online: always fetch the freshest version from the network (so any deploy
 * shows up immediately, no manual cache-busting ever again) and keep a copy.
 * Offline: fall back to the last cached copy, so the app still works.
 */
const CACHE = 'wordowl-runtime';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // drop any old caches, then take control of open pages right away
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // cache same-origin successful responses for offline use
      if (fresh && fresh.ok && new URL(req.url).origin === self.location.origin) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw new Error('offline and not cached');
    }
  })());
});
