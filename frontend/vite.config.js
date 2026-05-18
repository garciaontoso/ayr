import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// ─── PRE-BUILD GUARD (Bug #022 prevention 2026-05-18) ────────────────────
// Cualquier build que NO sea `vite dev` debe tener VITE_AYR_TOKEN definida.
// Sin ella el bundle bundlea token vacío → 401 en 11+ endpoints en producción.
// Esto pasa típicamente cuando se trabaja desde un git worktree (el .env.local
// no se copia al crear el worktree). Override con SKIP_TOKEN_CHECK=1 si se
// necesita generar un bundle sin token (raro).
function checkProductionToken(mode) {
  if (mode === 'development') return;
  if (process.env.SKIP_TOKEN_CHECK === '1') return;
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const token = env.VITE_AYR_TOKEN || process.env.VITE_AYR_TOKEN || '';
  if (!token || token.length < 16) {
    console.error('\n╔══════════════════════════════════════════════════════════════════╗');
    console.error('║ ⛔ BUILD ABORTED: VITE_AYR_TOKEN missing or too short            ║');
    console.error('╠══════════════════════════════════════════════════════════════════╣');
    console.error('║ Sin token bundleado, los 11+ endpoints protegidos devolverán 401.║');
    console.error('║                                                                   ║');
    console.error('║ Fix: copia .env.local del repo principal:                        ║');
    console.error('║   cp /Users/ricardogarciaontoso/IA/AyR/frontend/.env.local ./    ║');
    console.error('║                                                                   ║');
    console.error('║ Override (raro): SKIP_TOKEN_CHECK=1 npm run build                 ║');
    console.error('║                                                                   ║');
    console.error('║ Ver Bug #022 en docs/bug-patterns.md                              ║');
    console.error('╚══════════════════════════════════════════════════════════════════╝\n');
    process.exit(1);
  }
}

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
export default defineConfig(({ mode, command }) => {
  // Pre-build guard solo cuando se está construyendo (no en dev server)
  if (command === 'build') checkProductionToken(mode);
  return {
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
  };
})
