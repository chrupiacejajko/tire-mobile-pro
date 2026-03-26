const CACHE_NAME = 'routetire-worker-v1';
const STATIC_ASSETS = [
  '/worker',
  '/worker/route',
  '/worker/notifications',
  '/worker/profile',
  '/manifest.json',
];

// Install: cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: Network first for API, Cache first for pages/assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests: network only (don't cache API responses in SW — IndexedDB handles that)
  if (url.pathname.startsWith('/api/')) {
    return; // let browser handle normally
  }

  // Static assets and pages: stale-while-revalidate
  event.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached); // fallback to cache on network error

      return cached || fetchPromise;
    })
  );
});
