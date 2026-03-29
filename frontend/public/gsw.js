const V = 'g13';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.add('/gastos.html')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (new URL(e.request.url).pathname !== '/gastos.html') return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) caches.open(V).then(c => c.put('/gastos.html', r.clone()));
      return r;
    }).catch(() => caches.match('/gastos.html'))
  );
});
