import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// ─── BUILD_ID inyectado en bundle vía import.meta.env.VITE_BUILD_ID ─────
// Formato: "{ISO timestamp sin colons}_{git short SHA}"
//   ej: "2026-05-03_19-30-21_3933eb2"
// Se usa para:
//   - Etiquetar errores en /api/error-log (frontend/src/main.jsx + ErrorBoundary.jsx)
//   - Apuntar a sourcemaps en R2 bajo prefijo sourcemaps/{BUILD_ID}/
//     (subidos por scripts/upload-sourcemaps.js tras el build)
// Si no estamos en un repo git (CI sin clone profundo, etc.), cae a Date.now().
const BUILD_ID = (() => {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return `${ts}_${sha}`;
  } catch {
    return `dev-${Date.now()}`;
  }
})();

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(BUILD_ID),
  },
  build: {
    // Genera dist/assets/*.js.map junto a cada chunk. Necesario para
    // resolver stacks minificados en /api/errors/dashboard. Los .map se
    // suben a R2 (no se sirven desde Pages) — ver scripts/upload-sourcemaps.js.
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split React core into its own chunk so it's cached separately from
        // app code. All home and analysis tabs are already lazy (dynamic
        // imports) so they each emit their own chunk automatically.
        // Note: Vite 8 (rolldown) requires manualChunks as a function.
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
})
