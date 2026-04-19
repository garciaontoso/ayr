// KILL-SWITCH SW (2026-04-19) — reemplaza al SW anterior que cacheaba HTML y
// dejaba a los usuarios con página en blanco tras deploys. Esta versión:
//   1) Se activa inmediatamente (skipWaiting + clients.claim)
//   2) Borra TODOS los caches (incluso el nuevo)
//   3) Se des-registra sola
//   4) Recarga todos los tabs abiertos
// Tras la ejecución, el navegador ya no tiene SW, todas las peticiones van
// directas a la red (Cloudflare). El usuario ya no ve páginas en blanco.
//
// El registro en main.jsx se mantiene sólo para distribuir este kill-switch.
// Una vez pasado el parche, volveremos a un SW minimalista si queremos offline.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1) Borrar TODOS los caches
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    // 2) Des-registrar este SW
    await self.registration.unregister();
    // 3) Forzar reload en todos los clients (tabs abiertos)
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try { client.navigate(client.url); } catch {}
    }
  })());
});

// Pass-through fetch — no cache, todo va a red directamente.
self.addEventListener('fetch', () => {});
