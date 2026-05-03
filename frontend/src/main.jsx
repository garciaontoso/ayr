import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthGate from './AuthGate.jsx'
import { loadServerPrefs } from './utils/userPrefs'

// Hydrate cross-device preferences from D1 BEFORE first render. Non-blocking
// (returns void if endpoint unreachable). Restores tab order, column visibility,
// year order, category dots, etc set on a different device.
loadServerPrefs();
// bundle-bust 2026-04-21 — fix recurring página en blanco (SW controllerchange reload loop)
console.debug('A&R bundle', 'no-sw-2026-04-21');

// ─── Monkey patch fetch para añadir X-AYR-Auth a llamadas a api.onto-so.com ───
// Audit 2026-05-01: el worker requiere X-AYR-Auth en endpoints sensibles.
// En vez de tocar todos los fetch() del código, interceptamos aquí y añadimos
// el header automáticamente cuando la URL pertenece a nuestra API.
const AYR_TOKEN = import.meta.env.VITE_AYR_TOKEN || '';
const API_HOSTS = ['api.onto-so.com', 'aar-api.garciaontoso.workers.dev'];
const _origFetch = window.fetch;

// 2026-05-03 offline-mode hardening: when offline (or when a fetch fails
// with a network error), transparently fall back to the "ayr-offline-data"
// Cache API store. This lets every direct fetch() across the app work
// offline without each component needing its own cache lookup. Safe because:
//   - Only triggered after the original fetch fails (no double-network)
//   - Only reads, never writes — airplane mode is the only writer
//   - Returns a 504 stub if cache also misses, so callers see a clear status
async function readFromOfflineCache(input, _init) {
  try {
    if (!('caches' in self)) return null;
    const cache = await caches.open('ayr-offline-data');
    const reqUrl = typeof input === 'string' ? input : (input?.url || '');
    if (!reqUrl) return null;
    // Try the exact URL first
    let resp = await cache.match(reqUrl);
    if (resp) return resp;
    // Variant: query-string permutations (e.g. tickers list reordered)
    try {
      const u = new URL(reqUrl);
      const sp = [...u.searchParams.entries()].sort((a,b) => a[0].localeCompare(b[0]));
      const sortedQs = sp.map(([k,v]) => `${k}=${v}`).join('&');
      const sortedUrl = u.origin + u.pathname + (sortedQs ? `?${sortedQs}` : '');
      if (sortedUrl !== reqUrl) {
        resp = await cache.match(sortedUrl);
        if (resp) return resp;
      }
    } catch (_) {}
    return null;
  } catch (_) {
    return null;
  }
}

window.fetch = async function authedFetch(input, init) {
  let url = '';
  try { url = typeof input === 'string' ? input : (input?.url || ''); } catch (_) {}
  const isOurApi = API_HOSTS.some(h => url.includes(h));
  let newInit = init;
  if (isOurApi && AYR_TOKEN) {
    try {
      const headers = new Headers((init && init.headers) || (input?.headers) || {});
      if (!headers.has('X-AYR-Auth') && !headers.has('Authorization')) {
        headers.set('X-AYR-Auth', AYR_TOKEN);
      }
      newInit = { ...(init || {}), headers };
    } catch (_) { /* fall through */ }
  }

  // First attempt: real network. If we are CONFIRMED offline, skip straight
  // to cache so we don't waste time on a guaranteed-failing fetch.
  const isOffline = (typeof navigator !== 'undefined' && navigator.onLine === false);
  if (isOffline && isOurApi) {
    const cached = await readFromOfflineCache(input, newInit);
    if (cached) return cached;
    // Cache miss + offline → return a JSON stub so callers can degrade.
    return new Response(JSON.stringify({ error: 'offline', cached: false }), {
      status: 504, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    return await _origFetch.call(this, input, newInit);
  } catch (err) {
    // Network failure (CORS / DNS / TCP / TLS). If we have a cached copy,
    // serve it. Otherwise re-throw the original error.
    if (isOurApi) {
      const cached = await readFromOfflineCache(input, newInit);
      if (cached) {
        console.info('[fetch] offline-cache hit for', url);
        return cached;
      }
    }
    throw err;
  }
};

// ─── Global error capture (unhandled promise rejections + uncaught errors) ────
// Only posts to /api/error-log in production, or when
// localStorage.ayr_force_error_log === '1' (for dev testing).
// Throttle: max 5 reports per 10-second window to prevent flooding.
;(function installGlobalErrorHandlers() {
  const _API = 'https://api.onto-so.com';
  const _BUILD = import.meta.env?.VITE_BUILD_ID || 'dev';
  let _count = 0;
  let _windowStart = Date.now();

  function _shouldReport() {
    const now = Date.now();
    if (now - _windowStart > 10_000) { _count = 0; _windowStart = now; }
    if (_count >= 5) return false;
    _count++;
    const isProd = import.meta.env?.PROD;
    const forceLog = typeof localStorage !== 'undefined' && localStorage.getItem('ayr_force_error_log') === '1';
    return isProd || forceLog;
  }

  function _send(payload) {
    if (!_shouldReport()) return;
    try {
      fetch(`${_API}/api/error-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildId: _BUILD, ...payload }),
      }).catch(() => {});
    } catch (_) {}
  }

  // Uncaught synchronous errors (not caught by React's ErrorBoundary, e.g.
  // errors in event handlers, timers, etc.)
  window.addEventListener('error', function(ev) {
    // Skip ResizeObserver loop errors — browser bug, harmless
    if (ev.message && ev.message.includes('ResizeObserver')) return;
    _send({
      severity: 'error',
      message: ev.message || 'uncaught error',
      stack: ev.error?.stack || '',
      url: ev.filename || window.location.href,
      context: JSON.stringify({ lineno: ev.lineno, colno: ev.colno, type: 'window.error' }),
    });
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', function(ev) {
    const reason = ev.reason;
    const message = reason instanceof Error
      ? reason.message
      : (typeof reason === 'string' ? reason : JSON.stringify(reason));
    const stack = reason instanceof Error ? (reason.stack || '') : '';
    _send({
      severity: 'error',
      message: message || 'unhandled promise rejection',
      stack,
      url: window.location.href,
      context: JSON.stringify({ type: 'unhandledrejection' }),
    });
  });
})();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)

// ─── Service Worker permanentemente NO se registra desde aquí ─────────
// Razón: el registro de cualquier SW (incluso un kill-switch) creaba un
// "controllerchange" → location.reload() que interrumpía el mount de React
// produciendo páginas en blanco recurrentes en ayr.onto-so.com.
//
// En su lugar:
//   · index.html tiene un <script> inline que des-registra todo SW viejo
//     síncronamente ANTES de cargar el module bundle (defensa capa 2).
//   · public/sw.js sigue disponible como kill-switch si el navegador aún
//     tiene el SW antiguo instalado — pero NUNCA re-lo registramos.
//   · El fetch API de Cloudflare Pages trae `cache-control: must-revalidate`
//     para HTML y `immutable` para assets con hash — no necesitamos SW.
// ──────────────────────────────────────────────────────────────────────
