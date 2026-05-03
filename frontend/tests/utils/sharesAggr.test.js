// tests/utils/sharesAggr.test.js
//
// Defiende contra Bug Pattern #002 (PG 150 vs 250) y #011 (DIVIDENDS+shares
// legacy). Ver docs/bug-patterns.md.
//
// Reglas catalogadas:
//   • Suma global multi-cuenta (no leer running balance per-account).
//   • Filtrar tipo='DIVIDENDS' aunque tenga shares populated.
//   • SELL siempre cuenta como venta (sea por tipo='SELL' o shares<0).

import { describe, it, expect } from 'vitest';
import { aggregateShares, aggregateSharesByAccount } from '../../src/utils/sharesAggr';

describe('aggregateShares — caso simple', () => {
  it('3 trades EQUITY de 50 shares → 150', () => {
    const trades = [
      { tipo: 'EQUITY', shares: 50 },
      { tipo: 'EQUITY', shares: 50 },
      { tipo: 'EQUITY', shares: 50 },
    ];
    expect(aggregateShares(trades)).toBe(150);
  });

  it('compra 100 + venta 30 → 70', () => {
    const trades = [
      { tipo: 'EQUITY', shares: 100 },
      { tipo: 'SELL', shares: 30 },
    ];
    expect(aggregateShares(trades)).toBe(70);
  });

  it('venta representada como shares negativo (Flex convention) → resta correctamente', () => {
    const trades = [
      { tipo: 'EQUITY', shares: 100 },
      { tipo: 'EQUITY', shares: -30 }, // legacy / Flex usa neg para sell
    ];
    expect(aggregateShares(trades)).toBe(70);
  });
});

describe('aggregateShares — Bug Pattern #011 (DIVIDENDS legacy)', () => {
  it('IGNORA filas tipo=DIVIDENDS aunque tengan shares populated', () => {
    const trades = [
      { tipo: 'EQUITY', shares: 100 },
      { tipo: 'DIVIDENDS', shares: 10 }, // bug legacy — debe ignorarse
    ];
    // Si el bug regresa, este test devolvería 110 en vez de 100.
    expect(aggregateShares(trades)).toBe(100);
  });

  it('ignora variantes DIVIDEND y DIV', () => {
    const trades = [
      { tipo: 'EQUITY', shares: 50 },
      { tipo: 'DIVIDEND', shares: 5 },
      { tipo: 'DIV', shares: 5 },
    ];
    expect(aggregateShares(trades)).toBe(50);
  });

  it('case-insensitive: dividends en minúscula también se ignora', () => {
    const trades = [
      { tipo: 'equity', shares: 100 },
      { tipo: 'dividends', shares: 10 },
    ];
    expect(aggregateShares(trades)).toBe(100);
  });
});

describe('aggregateShares — Bug Pattern #002 (multi-cuenta)', () => {
  it('100 en cuenta U6735130 + 150 en cuenta NULL → 250 total', () => {
    // Caso PG real: la última fila per-account daba 150, pero el total
    // es 250 sumando todas las cuentas.
    const trades = [
      { tipo: 'EQUITY', shares: 100, account: 'U6735130' },
      { tipo: 'EQUITY', shares: 150, account: null },
    ];
    expect(aggregateShares(trades)).toBe(250);
  });

  it('aggregateSharesByAccount separa correctamente', () => {
    const trades = [
      { tipo: 'EQUITY', shares: 100, account: 'U6735130' },
      { tipo: 'EQUITY', shares: 150, account: null },
      { tipo: 'EQUITY', shares: 50, account: 'U6735130' },
    ];
    const byAcct = aggregateSharesByAccount(trades);
    expect(byAcct['U6735130']).toBe(150);
    expect(byAcct['__NULL__']).toBe(150);
  });
});

describe('aggregateShares — edge cases', () => {
  it('array vacío → 0', () => {
    expect(aggregateShares([])).toBe(0);
  });

  it('null/undefined → 0 (no crash)', () => {
    expect(aggregateShares(null)).toBe(0);
    expect(aggregateShares(undefined)).toBe(0);
  });

  it('trade con shares NaN/string → ignorado', () => {
    const trades = [
      { tipo: 'EQUITY', shares: NaN },
      { tipo: 'EQUITY', shares: 'foo' },
      { tipo: 'EQUITY', shares: 100 },
    ];
    expect(aggregateShares(trades)).toBe(100);
  });

  it('OPTION trades NO suman a equity shares', () => {
    const trades = [
      { tipo: 'EQUITY', shares: 100 },
      { tipo: 'OPTION', shares: 1 }, // contrato de opción ≠ share
    ];
    expect(aggregateShares(trades)).toBe(100);
  });

  it('venta total: 100 buy − 100 sell → 0', () => {
    const trades = [
      { tipo: 'EQUITY', shares: 100 },
      { tipo: 'SELL', shares: 100 },
    ];
    expect(aggregateShares(trades)).toBe(0);
  });

  it('mix de variantes tipo (BUY, SLD, etc.)', () => {
    const trades = [
      { tipo: 'BUY', shares: 50 },
      { tipo: 'EQUITY', shares: 50 },
      { tipo: 'SLD', shares: 30 },
    ];
    expect(aggregateShares(trades)).toBe(70);
  });
});
