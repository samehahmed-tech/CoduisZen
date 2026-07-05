/* RestoFlow LAN production builds run live from the server.
   This worker removes older offline caches that can keep stale HTTPS/assets. */
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        if ('caches' in self) {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((key) => key.startsWith('restoflow-'))
                    .map((key) => caches.delete(key)),
            );
        }
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => client.navigate(client.url));
    })());
});
