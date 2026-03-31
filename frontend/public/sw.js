const CACHE_NAME = 'ayr-v3.1';
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
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== 'ayr-offline-data').map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Push notifications
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'A&R', body: 'Nueva notificación' };
  e.waitUntil(
    self.registration.showNotification(data.title || 'A&R Alertas', {
      body: data.body || '',
      icon: '/apple-touch-icon.png',
      badge: '/favicon.svg',
      tag: data.tag || 'ayr-alert',
      data: { url: data.url || '/' },
    })
  );
});

// Click on notification → open app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      if (list.length) { list[0].focus(); return; }
      clients.openWindow(e.notification.data?.url || '/');
    })
  );
});

// Fetch: network-first for API, cache-first for static assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET and chrome-extension requests
  if (e.request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // API calls: network-first, fallback to offline cache
  if (url.pathname.startsWith('/api/') || url.hostname.includes('garciaontoso.workers.dev')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.open('ayr-offline-data').then(cache => cache.match(e.request))
      ).then(r => r || new Response(JSON.stringify({error:"offline"}), {headers:{"Content-Type":"application/json"}}))
    );
    return;
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
