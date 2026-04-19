import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthGate from './AuthGate.jsx'
// bundle-bust 2026-04-19 Oracle column + crons OFF — force new hash + SW update
console.debug('A&R bundle', 'oracle-2026-04-19');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)

// Service Worker DESACTIVADO (2026-04-19) — tras incidente de página en
// blanco causada por SW cacheando HTML/bundles viejos. Deployamos un
// "kill-switch" SW (public/sw.js) que se des-registra solo y limpia todos
// los caches. main.jsx NO registra un nuevo SW para evitar que vuelva a
// caché-contaminar la app.
//
// IMPORTANTE: mantenemos la registración ÚNICA del kill-switch aquí para
// que navegadores con el SW viejo ejecuten el kill. Una vez limpio, el
// propio kill-switch se des-registra y esta llamada solo re-instalaría el
// kill, que se vuelve a des-registrar — comportamiento inocuo.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=kill-2026-04-19').catch(() => {});
  });
  // Si el controller cambia (kill activado), recarga para usar red directa
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    location.reload();
  });
}
