/* Lake Salt Admin — service worker
   ─────────────────────────────────
   Goal: make the admin installable + load instantly offline-first for the
   static shell, while ALWAYS hitting the network for Firebase/Firestore data.

   Strategy:
   • Static assets (html/css/js/img under /admin/) → stale-while-revalidate.
   • Everything else (googleapis, gstatic, firestore, storage) → network only.
   Bump CACHE_VERSION to force-refresh the cached shell after a deploy. */
const CACHE_VERSION = 'ls-admin-v1';
const SHELL = [
  '/admin/',
  '/admin/index.html',
  '/admin/admin.css',
  '/admin/js/firebase-init.js',
  '/admin/js/auth.js',
  '/admin/js/dash-core.js',
  '/admin/js/app.js',
  '/admin/js/dashboard.js',
  '/admin/manifest.webmanifest'
];

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

  // Only manage same-origin requests under /admin/. Let Firebase + CDN go to network.
  const isAdminStatic = url.origin === self.location.origin && url.pathname.startsWith('/admin/');
  if (!isAdminStatic) return; // default browser fetch (network)

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
