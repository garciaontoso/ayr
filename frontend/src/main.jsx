import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthGate from './AuthGate.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)

// Register service worker for PWA — force activate new versions immediately
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js?v=3.3');
      // If a new SW is waiting, tell it to skip waiting and take over
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (newSW) {
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'activated') {
              // New SW activated — reload to use it
              if (navigator.serviceWorker.controller) location.reload();
            }
          });
        }
      });
    } catch {}
  });
  // When controller changes (new SW took over), reload
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    location.reload();
  });
}
