const CACHE_NAME = 'ayr-v3.4';
const OFFLINE_CACHE = 'ayr-offline-data';
const STATIC_ASSETS = ['/', '/index.html', '/favicon.svg', '/apple-touch-icon.png'];

// ─── URL normalization for consistent cache matching ───
function normalizeApiUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    // Remove params that only matter for network (not cache identity)
    u.searchParams.delete('refresh');
    u.searchParams.delete('live');
    // Sort tickers param alphabetically for consistent matching
    const tickers = u.searchParams.get('tickers');
    if (tickers) {
      u.searchParams.set('tickers', tickers.split(',').sort().join(','));
    }
    // Sort all params for consistency
    u.searchParams.sort();
    // Remove trailing empty params
    let s = u.toString();
    s = s.replace(/[&?]$/, '');
    return s;
  } catch { return urlStr; }
}

// Install: cache shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches (keep current + offline data)
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== OFFLINE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Push notifications
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'A&R', body: 'Nueva notificacion' };
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

// Listen for SKIP_WAITING message from main thread
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Click on notification
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      if (list.length) { list[0].focus(); return; }
      clients.openWindow(e.notification.data?.url || '/');
    })
  );
});

// ─── Fetch handler ───
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET and chrome-extension requests
  if (e.request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // API calls: network-first with smart cache fallback
  if (url.pathname.startsWith('/api/') || url.hostname.includes('garciaontoso.workers.dev')) {
    e.respondWith(handleApiRequest(e.request));
    return;
  }

  // JS/CSS chunks: cache-first when offline so React.lazy never sees a
  // failed dynamic import. Falls back to network if not cached.
  // Reason for change: previously the handler returned `cached || fetched`
  // where fetched.catch(()=>cached) could resolve to undefined when both
  // failed. respondWith(undefined) crashes the page.
  const isAsset = url.pathname.startsWith('/assets/') || url.pathname === '/' || url.pathname === '/index.html';
  if (isAsset) {
    e.respondWith(handleStaticAsset(e.request));
    return;
  }

  // Other static (favicon, manifest, etc.): cache-first too
  e.respondWith(handleStaticAsset(e.request));
});

// Static asset handler — cache-first with network fallback. Always returns
// a Response (never undefined) so respondWith never crashes.
async function handleStaticAsset(request) {
  // Try both caches (offline-data first, then app shell)
  try {
    const offlineHit = await caches.match(request);
    if (offlineHit) {
      // Background revalidate (don't await — stale-while-revalidate)
      fetch(request).then(r => {
        if (r && r.ok) {
          caches.open(CACHE_NAME).then(c => c.put(request, r.clone())).catch(() => {});
        }
      }).catch(() => {});
      return offlineHit;
    }
  } catch {}

  // Cache miss — try network
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(c => c.put(request, clone)).catch(() => {});
      return response;
    }
    return response || offlineErrorResponse(request);
  } catch {
    return offlineErrorResponse(request);
  }
}

// Build a graceful "offline" response that won't crash the browser
function offlineErrorResponse(request) {
  const url = new URL(request.url);
  // For JS chunks: return an empty module so the dynamic import resolves
  // to a no-op object instead of throwing. The lazy component renders
  // null and the user sees an empty tab body, but the app stays alive.
  if (url.pathname.endsWith('.js')) {
    return new Response(
      'export default function OfflineFallback(){return null}',
      { status: 200, headers: { 'Content-Type': 'application/javascript' } }
    );
  }
  if (url.pathname.endsWith('.css')) {
    return new Response('/* offline */', {
      status: 200, headers: { 'Content-Type': 'text/css' }
    });
  }
  return new Response('offline', { status: 503 });
}

// ─── API request handler: network-first + normalized cache fallback ───
async function handleApiRequest(request) {
  const normalized = normalizeApiUrl(request.url);

  try {
    // Try network first
    const response = await fetch(request);
    if (response.ok) {
      // Auto-update offline cache on success (both original and normalized key)
      const clone1 = response.clone();
      const clone2 = response.clone();
      const cache = await caches.open(OFFLINE_CACHE);
      // Store under both original URL and normalized URL for flexible matching
      cache.put(request, clone1).catch(() => {});
      if (normalized !== request.url) {
        cache.put(new Request(normalized), clone2).catch(() => {});
      }
      return response;
    }
    // Non-ok response: fall through to cache
    throw new Error('not-ok');
  } catch {
    // Network failed or non-ok: try cache
    const cache = await caches.open(OFFLINE_CACHE);
    // Try exact match first
    let cached = await cache.match(request);
    if (cached) return cached;
    // Try normalized URL
    cached = await cache.match(new Request(normalized));
    if (cached) return cached;
    // Try matching just the pathname (without query params) for some endpoints
    // This helps when e.g. limit=90 vs limit=365 — return whatever we have
    const pathOnly = new URL(request.url);
    const basePath = pathOnly.pathname;
    // For specific endpoints, try a broader match
    if (basePath.includes('nlv-history') || basePath.includes('costbasis')) {
      const keys = await cache.keys();
      for (const key of keys) {
        const keyUrl = new URL(key.url);
        if (keyUrl.pathname === basePath) return cache.match(key);
      }
    }
    // Nothing in cache
    return new Response(
      JSON.stringify({ error: "offline" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
}
