/* Lake Salt Admin — service worker
   ─────────────────────────────────
   Goal: make the admin installable + load instantly offline-first for the
   static shell, while ALWAYS hitting the network for Firebase/Firestore data.

   Strategy:
   • Static assets (html/css/js/img under /admin/) → stale-while-revalidate.
   • Everything else (googleapis, gstatic, firestore, storage) → network only.
   Bump CACHE_VERSION to force-refresh the cached shell after a deploy. */
const CACHE_VERSION = 'ls-admin-v9';
const SHELL = [
  '/admin/',
  '/admin/index.html',
  '/admin/admin.css',
  '/admin/js/firebase-init.js',
  '/admin/js/auth.js',
  '/admin/js/dash-core.js',
  '/admin/js/app.js',
  '/admin/js/dashboard.js',
  '/admin/js/widgets/agent-brief.js',
  '/admin/js/push.js',
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

/* ─── Web Push (FCM data messages) ─────────────────────────────────────────
   Cloud Function sendPushNotification sends DATA-ONLY messages; we display
   them here manually. iOS requires every push to show a visible notification. */
self.addEventListener('push', (e) => {
  let d = {};
  try {
    const payload = e.data ? e.data.json() : {};
    d = payload.data || payload.notification || payload || {};
  } catch (_) { /* non-JSON push */ }
  const title = d.title || 'Lake Salt';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    tag: d.tag || 'lake-salt',
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    data: { url: d.url || '/admin/#crm' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/admin/#crm';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes('/admin/') && 'focus' in c) { c.navigate(url); return c.focus(); }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Web Share Target: photo shared into the app → stash in the offline queue,
  // then bounce to the app which drains it. Never touches the cache logic below.
  if (req.method === 'POST' && url.pathname === '/admin/share-receipt') {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const files = form.getAll('receipt').filter(f => f && f.size);
        const dbi = await new Promise((resolve, reject) => {
          const req = indexedDB.open('lakesalt-scans', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('receipt-queue', { keyPath: 'id', autoIncrement: true });
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        await Promise.all(files.map(f => new Promise((resolve, reject) => {
          const tx = dbi.transaction('receipt-queue', 'readwrite');
          tx.objectStore('receipt-queue').add({ blob: f, queuedAt: Date.now() });
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
        })));
      } catch (err) { /* swallow — redirect regardless so the user isn't stranded */ }
      return Response.redirect('/admin/?action=shared', 303);
    })());
    return;
  }

  if (req.method !== 'GET') return;

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
