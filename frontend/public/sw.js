// KILL-SWITCH SW v2 (2026-04-21) — versión silenciosa.
// Reemplaza al SW anterior que además de auto-des-registrarse hacía
// client.navigate(client.url). Ese reload competía con el mount de React
// causando blank-screens recurrentes en ayr.onto-so.com (documentado
// en 2026-04-08 / 2026-04-19 / 2026-04-21).
//
// Esta versión:
//   1) Se activa inmediatamente (skipWaiting + clients.claim)
//   2) Borra TODOS los caches
//   3) Se des-registra sola — y NADA MÁS. No fuerza reload.
//
// El index.html ya incluye un <script> inline que des-registra cualquier
// SW antes de cargar el bundle, así que no necesitamos forzar reload aquí.
// main.jsx ya NO registra este SW — sólo sigue aquí para navegadores que
// aún tengan la versión v1 instalada.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
  })());
});

// Pass-through fetch — nunca cachear, nunca interceptar.
self.addEventListener('fetch', () => {});
