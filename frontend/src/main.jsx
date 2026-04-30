import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthGate from './AuthGate.jsx'
// bundle-bust 2026-04-21 — fix recurring página en blanco (SW controllerchange reload loop)
console.debug('A&R bundle', 'no-sw-2026-04-21');

// ─── Monkey patch fetch para añadir X-AYR-Auth a llamadas a api.onto-so.com ───
// Audit 2026-05-01: el worker requiere X-AYR-Auth en endpoints sensibles.
// En vez de tocar todos los fetch() del código, interceptamos aquí y añadimos
// el header automáticamente cuando la URL pertenece a nuestra API.
const AYR_TOKEN = import.meta.env.VITE_AYR_TOKEN || '';
const API_HOSTS = ['api.onto-so.com', 'aar-api.garciaontoso.workers.dev'];
const _origFetch = window.fetch;
window.fetch = function authedFetch(input, init) {
  try {
    let url = typeof input === 'string' ? input : (input?.url || '');
    const isOurApi = API_HOSTS.some(h => url.includes(h));
    if (isOurApi && AYR_TOKEN) {
      const headers = new Headers((init && init.headers) || (input?.headers) || {});
      if (!headers.has('X-AYR-Auth') && !headers.has('Authorization')) {
        headers.set('X-AYR-Auth', AYR_TOKEN);
      }
      const newInit = { ...(init || {}), headers };
      return _origFetch.call(this, input, newInit);
    }
  } catch (e) {
    // si algo falla, fall back a fetch original
  }
  return _origFetch.call(this, input, init);
};

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
