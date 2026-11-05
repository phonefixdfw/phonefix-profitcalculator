// The production build prepends CACHE_NAME and PRECACHE_URLS with a content hash.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('phonefix-precache-') && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

// Keep a new deploy waiting until the user accepts or all app windows close.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Navigations (including a QR link's fragment) always use the cached app shell.
  const path = event.request.mode === 'navigate' ? '/index.html' : url.pathname;
  if (!PRECACHE_URLS.includes(path)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => (await cache.match(path)) || fetch(event.request)));
});
