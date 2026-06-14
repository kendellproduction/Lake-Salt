/* Hub launcher — minimal service worker for installability + offline shell.
   Only the hub's own page is cached; the tiles navigate to full apps that
   manage their own caching. Bump CACHE_VERSION to refresh after a deploy. */
const CACHE_VERSION = 'ls-hub-v1';
const SHELL = ['/hub/', '/hub/index.html', '/hub/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only the hub's own static files; let tile destinations go to network.
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/hub/')) return;
  e.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
