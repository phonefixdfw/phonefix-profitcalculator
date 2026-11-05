// Served only by Vite's dev server, at the production worker's registered URL.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('phonefix-precache-')).map((name) => caches.delete(name)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    // Unregister before navigating so the next documents load dev code without
    // a controlling worker. Other caches and localStorage remain untouched.
    await self.registration.unregister();
    await Promise.all(clients.map((client) => client.navigate(client.url)));
  })());
});
