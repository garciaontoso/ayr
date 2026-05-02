// Dedicated push-only service worker (2026-05-02).
// Handles 'push' and 'notificationclick' events. Does NOT intercept fetch
// (avoids the blank-screen race documented in 2026-04-08/19/21).
//
// Scope is /sw-push so it never controls navigation. The index.html
// unregister-all defense skips workers whose scriptURL ends with /sw-push.js.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// No fetch handler on purpose — keeps the SW transparent.

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'A&R', body: event.data?.text?.() || '' }; }
  const title = data.title || 'A&R';
  const options = {
    body: data.body || '',
    tag: data.tag || 'ayr-default',
    data: { url: data.url || '/' },
    icon: '/apple-touch-icon.png',
    badge: '/favicon.svg',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clientsArr) {
      if (c.url.includes(targetUrl) && 'focus' in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});
