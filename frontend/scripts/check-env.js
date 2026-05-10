#!/usr/bin/env node
// Pre-build guard: prevent shipping a bundle without VITE_AYR_TOKEN baked in.
// Bug #021 (2026-05-10): builds from git worktrees without a local .env.local
// silently produced bundles with empty token → all auth-protected endpoints
// returned 401 in production until manually rebuilt.
//
// This script aborts `npm run build` if the token can't be resolved.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const envFiles = ['.env.local', '.env.production', '.env'];
const envMerged = {};
for (const f of envFiles) {
  Object.assign(envMerged, readDotEnv(path.join(frontendRoot, f)));
}

// Also check process.env (CI overrides)
const tokenFromEnv = process.env.VITE_AYR_TOKEN;
const tokenResolved = tokenFromEnv || envMerged.VITE_AYR_TOKEN || '';

if (!tokenResolved || tokenResolved.length < 32) {
  console.error('\n❌ BUILD ABORTED — Bug #021 guard\n');
  console.error('VITE_AYR_TOKEN no resuelto a un valor válido (>32 chars).');
  console.error('');
  console.error('Causa común: trabajar desde un git worktree donde .env.local NO existe.');
  console.error('');
  console.error('Fix:');
  console.error('  1. Verificar `ls frontend/.env.local`');
  console.error('  2. Si no existe, copiar del repo principal:');
  console.error('       cp ../../../frontend/.env.local frontend/.env.local');
  console.error('  3. Re-run `npm run build`');
  console.error('');
  console.error('Sin esto, el bundle saldría con token vacío y TODOS los endpoints');
  console.error('protegidos devolverían 401 en producción (ver bug-patterns.md #021).\n');
  process.exit(1);
}

console.log(`✅ pre-build env check OK — VITE_AYR_TOKEN resuelto (${tokenResolved.length} chars)`);
