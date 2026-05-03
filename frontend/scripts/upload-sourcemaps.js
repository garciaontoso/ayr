#!/usr/bin/env node
/**
 * upload-sourcemaps.js — Sube dist/assets/*.js.map a R2 después del build.
 *
 * Bucket: ayr-earnings-archive (reusado, prefijo sourcemaps/)
 * Layout: sourcemaps/{BUILD_ID}/{filename.js.map}
 *
 * BUILD_ID se calcula igual que en vite.config.js:
 *   "{timestamp}_{git short SHA}"  ej: "2026-05-03_19-30-21_3933eb2"
 *
 * Uso (manual):
 *   cd frontend && npm run build && npm run upload:sourcemaps
 *
 * Integración deploy:safe del root:
 *   npm run build → npm run upload:sourcemaps → wrangler pages deploy
 *
 * Decisión de tamaño: subimos TODOS los .map (incluidos lazy chunks) porque:
 *   - El total típico es <5MB (texto + base64 mappings, comprimido bien por R2)
 *   - Cualquier tab puede generar un error que el dashboard quiera resolver
 *   - Si el total crece >50MB, considerar filtrar a solo `index-*.js.map`
 *
 * No falla el build si un map falla — solo loggea. Las sourcemaps son
 * para diagnóstico post-mortem; no bloquean usuarios.
 */
import { readdirSync, _readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'dist/assets');
const BUCKET = 'ayr-earnings-archive';

// BUILD_ID: usa env si lo pasaron explícito, si no recalcula igual que vite.config.js
const BUILD_ID = process.env.VITE_BUILD_ID || (() => {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return `${ts}_${sha}`;
  } catch {
    return `dev-${Date.now()}`;
  }
})();

let maps;
try {
  maps = readdirSync(DIST).filter((f) => f.endsWith('.js.map'));
} catch (e) {
  console.error(`[sourcemaps] no dist/assets dir found at ${DIST} — did you run "npm run build"?`);
  process.exit(0); // exit 0 to not break deploy chain in dev/CI without a build
}

if (maps.length === 0) {
  console.warn('[sourcemaps] no .js.map files found — verify vite.config.js has build.sourcemap=true');
  process.exit(0);
}

let totalBytes = 0;
for (const f of maps) totalBytes += statSync(`${DIST}/${f}`).size;
const totalMB = (totalBytes / 1024 / 1024).toFixed(2);

console.log(`[sourcemaps] uploading ${maps.length} maps (${totalMB} MB total) buildId=${BUILD_ID}`);

let ok = 0;
let fail = 0;
for (const f of maps) {
  const filePath = `${DIST}/${f}`;
  const key = `sourcemaps/${BUILD_ID}/${f}`;
  const sizeKB = Math.round(statSync(filePath).size / 1024);
  try {
    // --remote → escribe al bucket R2 real (no al simulator local)
    // stdio: 'pipe' → captura output (silencia salvo error)
    execSync(
      `npx wrangler r2 object put ${BUCKET}/${key} --file=${filePath} --remote`,
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    console.log(`  ok  ${f} (${sizeKB} KB)`);
    ok++;
  } catch (e) {
    const msg = (e.stderr?.toString() || e.message || '').slice(0, 240);
    console.error(`  ERR ${f}: ${msg}`);
    fail++;
  }
}

console.log(`[sourcemaps] done — ${ok} uploaded, ${fail} failed`);
// No exit code 1 on partial failures — deploy chain shouldn't break for diagnostics
