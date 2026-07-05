const CACHE_NAME = 'restoflow-erp-v1';
const DYNAMIC_CACHE = 'restoflow-dynamic-v1';

// Install event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                '/',
                '/index.html',
                '/manifest.json'
            ]);
        })
    );
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME && key !== DYNAMIC_CACHE)
                    .map(key => caches.delete(key))
            );
        })
    );
    return self.clients.claim();
});

// Fetch event (Network first, then cache)
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        // Skip non-GET requests for caching
        return;
    }

    // Skip API requests and let application code handle them (including Dexie integration)
    if (event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(res => {
                const resClone = res.clone();
                caches.open(DYNAMIC_CACHE).then(cache => {
                    cache.put(event.request, resClone);
                });
                return res;
            })
            .catch(() => caches.match(event.request))
    );
});

// Background Sync
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-pos-queue') {
        event.waitUntil(processSyncQueue());
    }
});

async function processSyncQueue() {
    // In a real implementation, we would access IndexedDB (Dexie) directly
    // here via native APIs or import the compiled Dexie logic via importScripts.
    // However, a common workaround is to send a message to all clients 
    // to trigger the sync logic in the Window context.
    const clients = await self.clients.matchAll();
    for (const client of clients) {
        client.postMessage({ type: 'TRIGGER_BACKGROUND_SYNC' });
    }
}
