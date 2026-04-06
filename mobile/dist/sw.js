const CACHE_NAME = 'ayr-mobile-v1';
const OFFLINE_CACHE = 'ayr-mobile-data';
const STATIC_ASSETS = ['/', '/index.html', '/favicon.svg'];

function normalizeApiUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    u.searchParams.delete('refresh');
    u.searchParams.delete('live');
    const tickers = u.searchParams.get('tickers');
    if (tickers) u.searchParams.set('tickers', tickers.split(',').sort().join(','));
    u.searchParams.sort();
    return u.toString().replace(/[&?]$/, '');
  } catch { return urlStr; }
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== OFFLINE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.protocol === 'chrome-extension:') return;
  if (url.pathname.startsWith('/api/') || url.hostname.includes('garciaontoso.workers.dev')) {
    e.respondWith(handleApi(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(r => {
        if (r.ok) { const c = r.clone(); caches.open(CACHE_NAME).then(cache => cache.put(e.request, c)); }
        return r;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});

async function handleApi(request) {
  const normalized = normalizeApiUrl(request.url);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const c1 = response.clone(), c2 = response.clone();
      const cache = await caches.open(OFFLINE_CACHE);
      cache.put(request, c1).catch(() => {});
      if (normalized !== request.url) cache.put(new Request(normalized), c2).catch(() => {});
      return response;
    }
    throw new Error('not-ok');
  } catch {
    const cache = await caches.open(OFFLINE_CACHE);
    let cached = await cache.match(request);
    if (cached) return cached;
    cached = await cache.match(new Request(normalized));
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  }
}
