// Regression test — /api/gastos POST auth se revierte recurrentemente.
//
// Bug history:
//   • 2026-05-04: PWA gastos colgaba 5+5 gastos en localStorage sin poder sync.
//     CAUSA: monkey-patch auth en main.jsx no existía en PWAs instaladas pre-2026-05-01.
//     FIX: auth removed de POST /api/gastos.
//   • 2026-05-18: usuario reporta "ya no recuerdo cuántas veces hemos tenido que
//     arreglarla". El auth fue REVERTIDO en algún rebase/merge. Re-arreglado
//     con patrón origin-aware (mismo que DELETE/PUT en el mismo file).
//
// Este test ataca el PATRÓN, no el endpoint en sí — verifica que el código
// en worker.js usa el pattern correcto, no `ytRequireToken` ciego.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workerSrc = readFileSync(
  resolve(__dirname, '../../../api/src/worker.js'),
  'utf-8'
);

describe('Bug Gastos-Sync Auth — patrón origin-aware en POST /api/gastos', () => {
  it('POST /api/gastos NO usa ytRequireToken bare (sin bypass)', () => {
    // Buscamos el bloque POST /api/gastos
    const postBlockStart = workerSrc.indexOf('path === "/api/gastos" && request.method === "POST"');
    expect(postBlockStart).toBeGreaterThan(0);

    // Tomamos las 10 líneas siguientes al match
    const blockEnd = workerSrc.indexOf('return', postBlockStart);
    const block = workerSrc.slice(postBlockStart, blockEnd);

    // Patrón PROHIBIDO: const unauth = ytRequireToken(...) seguido de if (unauth) return
    // (es lo que se reintroduce siempre)
    const badPattern = /const\s+unauth\s*=\s*ytRequireToken\([^)]+\);\s*if\s*\(\s*unauth\s*\)\s*return\s+unauth/;
    expect(badPattern.test(block)).toBe(false);
  });

  it('POST /api/gastos usa patrón origin-aware bypass', () => {
    const postBlockStart = workerSrc.indexOf('path === "/api/gastos" && request.method === "POST"');
    const blockEnd = workerSrc.indexOf('return', postBlockStart);
    const block = workerSrc.slice(postBlockStart, blockEnd);
    // Patrón VALIDO: `(isAllowed && origin) ? null : ytRequireToken(...)`
    // O sin auth en absoluto.
    const goodPatternOriginAware = /\(isAllowed\s*&&\s*origin\)\s*\?\s*null\s*:\s*ytRequireToken/;
    // No tener ningún ytRequireToken también es válido (auth removida)
    const noAuth = !/ytRequireToken/.test(block);
    expect(goodPatternOriginAware.test(block) || noAuth).toBe(true);
  });

  it('DELETE /api/gastos/:id usa el mismo patrón consistente', () => {
    const deleteStart = workerSrc.indexOf('path.startsWith("/api/gastos/") && request.method === "DELETE"');
    expect(deleteStart).toBeGreaterThan(0);
    const blockEnd = workerSrc.indexOf('return', deleteStart);
    const block = workerSrc.slice(deleteStart, blockEnd);
    const goodPattern = /\(isAllowed\s*&&\s*origin\)\s*\?\s*null\s*:\s*ytRequireToken/;
    expect(goodPattern.test(block)).toBe(true);
  });

  it('PUT /api/gastos/:id NO tiene ytRequireToken bare', () => {
    const putStart = workerSrc.indexOf('path.startsWith("/api/gastos/") && request.method === "PUT"');
    expect(putStart).toBeGreaterThan(0);
    const blockEnd = workerSrc.indexOf('return json', putStart);
    const block = workerSrc.slice(putStart, blockEnd);
    const badPattern = /const\s+unauth\s*=\s*ytRequireToken\([^)]+\);\s*if\s*\(\s*unauth\s*\)\s*return\s+unauth/;
    expect(badPattern.test(block)).toBe(false);
  });
});

describe('Bug Gastos-Sync URL — PWA debe usar api.onto-so.com no workers.dev', () => {
  it('gastos.html PWA NO usa la URL bloqueada workers.dev en código activo', () => {
    const gastosHtml = readFileSync(
      resolve(__dirname, '../../public/gastos.html'),
      'utf-8'
    );
    // Eliminar comentarios JS (// ... y /* ... */) y luego buscar la URL
    const codeOnly = gastosHtml
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*\n/g, '\n');
    const workersDev = /aar-api\.garciaontoso\.workers\.dev/;
    expect(workersDev.test(codeOnly)).toBe(false);
  });

  it('gastos.html usa api.onto-so.com', () => {
    const gastosHtml = readFileSync(
      resolve(__dirname, '../../public/gastos.html'),
      'utf-8'
    );
    expect(gastosHtml.includes('https://api.onto-so.com')).toBe(true);
  });
});
