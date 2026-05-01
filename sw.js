/* ═══════════════════════════════════════════════════════════
   Silverworld Screens — Service Worker
   Strategy: Cache-first for app shell (HTML/CSS/JS files),
   network-only for Drive API / Google CDN calls.

   This lets the player.html, admin.html, and index.html load
   instantly from cache even when the TV is offline or the
   network is slow. All media blobs are stored in IndexedDB
   by the player itself — this SW only handles the app shell.
   ═══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'sw-screens-v1';

// App shell files to pre-cache on install
const SHELL = [
  './player.html',
  './admin.html',
  './index.html',
];

/* ── Install: pre-cache app shell ───────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

/* ── Activate: delete old cache versions ────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // take control of all tabs
  );
});

/* ── Fetch: cache-first for shell, passthrough for APIs ─── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only intercept same-origin requests (the GitHub Pages origin)
  // Pass through googleapis.com, drive.google.com, etc. untouched —
  // those are handled by IndexedDB caching in player.js.
  if (url.origin !== self.location.origin) return;

  // Cache-first strategy for app shell HTML files
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Serve from cache immediately, then revalidate in background
        fetch(event.request)
          .then(fresh => {
            if (fresh && fresh.status === 200) {
              caches.open(CACHE_NAME).then(c => c.put(event.request, fresh.clone()));
            }
          })
          .catch(() => {}); // ignore network errors during background revalidation
        return cached;
      }

      // Not in cache — fetch and cache for next time
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, toCache));
        return response;
      });
    })
  );
});
