import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthGate from './AuthGate.jsx'
// bundle-bust 2026-04-21 — fix recurring página en blanco (SW controllerchange reload loop)
console.debug('A&R bundle', 'no-sw-2026-04-21');

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
