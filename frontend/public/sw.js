const CACHE_NAME = 'ayr-v10.2';
const STATIC_ASSETS = ['/', '/index.html', '/favicon.svg', '/apple-touch-icon.png'];

// Install: cache shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for API, cache-first for static assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET and chrome-extension requests
  if (e.request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // API calls: network-first with timeout
  if (url.pathname.startsWith('/api/') || url.hostname.includes('garciaontoso.workers.dev')) {
    return; // Let API calls go through normally — worker has its own cache
  }

  // Static assets: stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached); // Offline fallback to cache

      return cached || fetched;
    })
  );
});
