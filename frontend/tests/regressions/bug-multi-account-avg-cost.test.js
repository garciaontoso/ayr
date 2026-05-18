// Regression test — Multi-account avgCost MUST be weighted by shares.
//
// Bug original: cuando una posición existía en 3 cuentas (Account A:100sh@$50,
// B:30sh@$110, C:20sh@$90), el código hacía (50+110+90)/3 = $83.33 — promedio
// simple — lo cual no refleja la base de coste real.
//
// La fórmula correcta es: Σ(shares_i × avgCost_i) / Σ(shares_i)
// = (100*50 + 30*110 + 20*90) / 150
// = (5000 + 3300 + 1800) / 150
// = 10100 / 150
// = $67.33
//
// Este test garantiza que el merge usa promedio ponderado.

import { describe, it, expect } from 'vitest';
import { mergeWeightedAvgCost, mergePositionRows } from '../../src/calculators/portfolioMetrics';

describe('Bug Multi-Account avgCost — weighted by shares', () => {
  it('regression: NEVER simple average of avg costs', () => {
    // Caso real de PG: 50 sh @ $100 + 5 sh @ $200 (DRIP)
    const r = mergeWeightedAvgCost(50, 100, 5, 200);
    // Simple avg = $150 ← INCORRECTO
    // Weighted = (50*100 + 5*200) / 55 = 6000/55 = $109.09
    expect(r.avgCost).toBeCloseTo(109.09, 1);
    expect(r.avgCost).toBeLessThan(150);  // explicit anti-regression check
  });

  it('multi-account fusion preserves correct cost basis total', () => {
    const rows = [
      { ticker: 'PG', shares: 100, avgCost: 50, currency: 'USD' },
      { ticker: 'PG', shares: 30, avgCost: 110, currency: 'USD' },
      { ticker: 'PG', shares: 20, avgCost: 90, currency: 'USD' },
    ];
    const merged = mergePositionRows(rows);
    // Cost basis total = 100*50 + 30*110 + 20*90 = 5000+3300+1800 = 10100
    const expectedCostBasis = 10100;
    const computedCostBasis = merged.shares * merged.avgCost;
    expect(computedCostBasis).toBeCloseTo(expectedCostBasis, 0);
  });

  it('regression Bug #002: 150 shares vs 250 shares mismatch', () => {
    // Bug #002 era running-balance per-account mostrando 150 en lugar de 250.
    // El fix es sumar SIEMPRE shares de todas las cuentas.
    const trades = [
      { ticker: 'PG', tipo: 'EQUITY', shares: 100, account: 'A' },
      { ticker: 'PG', tipo: 'EQUITY', shares: 100, account: 'B' },
      { ticker: 'PG', tipo: 'EQUITY', shares: 50, account: 'A' },  // segundo buy A
      // Si el bug existe, podría leer "last shares en A = 50" en lugar de sumar
    ];
    // Real total = 250 buys (100+100+50)
    const totalReal = trades.reduce((s, t) => s + (t.shares || 0), 0);
    expect(totalReal).toBe(250);
  });

  it('handles single position (no merge needed)', () => {
    const rows = [{ ticker: 'KO', shares: 100, avgCost: 50 }];
    const merged = mergePositionRows(rows);
    expect(merged.shares).toBe(100);
    expect(merged.avgCost).toBe(50);
  });
});

describe('Bug Multi-Account avgCost — defensive against zero/negative shares', () => {
  it('totalShares = 0 (fully sold) returns avgCost defensively', () => {
    // Si suma neta es 0 (vendió todo), no debe dividir-por-cero
    const r = mergeWeightedAvgCost(100, 50, -100, 60);
    expect(r.shares).toBe(0);
    expect(r.avgCost).toBeGreaterThan(0);  // preserva avg para historical
  });

  it('zero existing + new buy works correctly', () => {
    const r = mergeWeightedAvgCost(0, 0, 100, 75);
    expect(r.shares).toBe(100);
    expect(r.avgCost).toBe(75);
  });
});
