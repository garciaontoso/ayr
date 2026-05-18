// Regression test — IB Bridge response shape ambigüedad (bug crítico 2026-05-XX).
//
// Síntoma: el bridge a veces devolvía Array directo [{ticker:'KO',...}, ...]
// y otras veces lo envolvía en {positions:[...]}. El código en worker.js
// hacía `bp.positions` ciegamente → cuando llegaba array, undefined → 0 inserts
// silencioso → portfolio dejaba de actualizarse durante días.
//
// Este test garantiza que normalizeBridgePositions() acepta TODOS los shapes
// posibles (array, {positions}, {data}) y devuelve siempre array.

import { describe, it, expect } from 'vitest';
import { normalizeBridgePositions } from '../../src/validators/schemas';

describe('Bug Bridge-Array — IB Bridge response normalization', () => {
  it('handles direct array response (most common from ib-bridge)', () => {
    const response = [
      { ticker: 'KO', position: 100, market_price: 70 },
      { ticker: 'PG', position: 50, market_price: 150 },
    ];
    const normalized = normalizeBridgePositions(response);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].ticker).toBe('KO');
  });

  it('handles {positions: [...]} wrapped response', () => {
    const response = {
      positions: [{ ticker: 'AAPL', position: 200 }],
    };
    const normalized = normalizeBridgePositions(response);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].ticker).toBe('AAPL');
  });

  it('handles {data: [...]} wrapped response (NAS variant)', () => {
    const response = { data: [{ ticker: 'JNJ', position: 75 }] };
    const normalized = normalizeBridgePositions(response);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].ticker).toBe('JNJ');
  });

  it('regression: object without array key returns empty, not crash', () => {
    // El bug original: hacer .positions sobre objeto sin esa clave devolvía undefined.
    // Si más tarde alguien hace .map() o .length, crash. Esto debe devolver [] safely.
    const fake = { error: 'No data', code: 500 };
    expect(() => normalizeBridgePositions(fake)).not.toThrow();
    expect(normalizeBridgePositions(fake)).toEqual([]);
  });

  it('regression: null/undefined returns empty array', () => {
    expect(normalizeBridgePositions(null)).toEqual([]);
    expect(normalizeBridgePositions(undefined)).toEqual([]);
  });

  it('regression: string response returns empty', () => {
    expect(normalizeBridgePositions('ERROR')).toEqual([]);
  });
});

describe('Bug Bridge-Array — UPSERT flow (silent noop guard)', () => {
  // Simula el flujo donde el código suponía .positions
  const upsertedPositions = [];

  function processBridgeResponse(raw) {
    // Versión CORREGIDA usa normalizeBridgePositions
    const positions = normalizeBridgePositions(raw);
    upsertedPositions.length = 0;  // reset
    for (const p of positions) {
      if (p.ticker && (p.position || p.shares)) {
        upsertedPositions.push({ ticker: p.ticker, shares: p.position || p.shares });
      }
    }
    return upsertedPositions.length;
  }

  it('inserts all positions when bridge returns array', () => {
    const count = processBridgeResponse([
      { ticker: 'KO', position: 100 },
      { ticker: 'PG', position: 50 },
    ]);
    expect(count).toBe(2);
  });

  it('inserts all positions when bridge returns {positions: array}', () => {
    const count = processBridgeResponse({ positions: [
      { ticker: 'KO', position: 100 },
      { ticker: 'PG', position: 50 },
    ]});
    expect(count).toBe(2);
  });

  it('DOES NOT silently insert 0 when bridge returns array but code expected object', () => {
    // Bug original: bp.positions sobre array → undefined → forEach no ejecuta → 0 inserts
    // Test simula que con el fix la situación nunca se da
    const count = processBridgeResponse([
      { ticker: 'KO', position: 100 },
    ]);
    expect(count).toBeGreaterThan(0);
  });
});
