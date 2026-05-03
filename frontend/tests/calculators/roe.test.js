// tests/calculators/roe.test.js
//
// ROE Buffett vs ROE GuruFocus (avg equity).
//
// Contexto: en v4.4 (CLAUDE.md) cambiamos la fórmula a "avg equity"
// estándar GuruFocus/Morningstar/CFA. La versión Buffett (ending equity)
// se mantiene como `roeBuffett` para comparación.
//
// La lógica vive inline en src/hooks/useAnalysisMetrics.js ~L43-54:
//   const avgEquity = dPrev?.equity ? (d.equity + dPrev.equity) / 2 : d.equity;
//   roe: div(d.netIncome, avgEquity),
//   roeBuffett: div(d.netIncome, d.equity),
//
// Replicamos la fórmula como funciones puras para testear sin React.
// Si un día se extraen a calculators/, se actualizan los imports.

import { describe, it, expect } from 'vitest';

/** ROE estándar (GuruFocus, Morningstar, CFA): NI / avg equity */
function roeStandard(netIncome, equityStart, equityEnd) {
  if (equityStart == null || !Number.isFinite(equityStart)) {
    // Si no hay equity prev, fallback a ending (igual que el hook real)
    if (!Number.isFinite(equityEnd) || equityEnd === 0) return null;
    return netIncome / equityEnd;
  }
  if (!Number.isFinite(equityEnd)) return null;
  const avg = (equityStart + equityEnd) / 2;
  if (avg === 0) return null;
  return netIncome / avg;
}

/** ROE Buffett: NI / ending equity */
function roeBuffett(netIncome, equityEnd) {
  if (!Number.isFinite(equityEnd) || equityEnd === 0) return null;
  return netIncome / equityEnd;
}

describe('ROE Buffett vs ROE GuruFocus (avg equity)', () => {
  it('NI=100M, equityStart=900M, equityEnd=1100M → Buffett ≈ 9.09%, GF = 10.0%', () => {
    const ni = 100_000_000;
    const eqStart = 900_000_000;
    const eqEnd = 1_100_000_000;

    const buffett = roeBuffett(ni, eqEnd);
    const gf = roeStandard(ni, eqStart, eqEnd);

    expect(buffett).toBeCloseTo(0.0909, 4); // 100/1100 ≈ 0.0909
    expect(gf).toBeCloseTo(0.1000, 4);      // 100/1000 = 0.10
    expect(gf).toBeGreaterThan(buffett);    // con equity creciendo, GF > Buffett
  });

  it('equity decreciente (buybacks): GF < Buffett', () => {
    // Empresa hace buybacks, equity baja. Ejemplo: ZTS-style.
    const ni = 200_000_000;
    const eqStart = 1_500_000_000;
    const eqEnd = 1_000_000_000; // bajó por buybacks
    const buffett = roeBuffett(ni, eqEnd);     // 200/1000 = 0.20
    const gf = roeStandard(ni, eqStart, eqEnd); // 200/1250 = 0.16
    expect(buffett).toBeCloseTo(0.20, 4);
    expect(gf).toBeCloseTo(0.16, 4);
    expect(gf).toBeLessThan(buffett);
  });

  it('sin prev equity: GF cae al fallback Buffett (igual que el hook)', () => {
    const ni = 50_000_000;
    const eqEnd = 500_000_000;
    expect(roeStandard(ni, undefined, eqEnd)).toBeCloseTo(0.10, 4);
    expect(roeStandard(ni, null, eqEnd)).toBeCloseTo(0.10, 4);
  });

  it('equity=0 → null (no division by zero)', () => {
    expect(roeBuffett(100, 0)).toBeNull();
    expect(roeStandard(100, 0, 0)).toBeNull();
  });

  it('NI negativo (empresa en pérdidas) → ROE negativo, sin crash', () => {
    const buffett = roeBuffett(-50_000_000, 500_000_000);
    expect(buffett).toBeCloseTo(-0.10, 4);
    expect(Number.isFinite(buffett)).toBe(true);
  });

  it('avg equity=0 (corner case) → null', () => {
    // equityStart=-100, equityEnd=100 → avg=0
    expect(roeStandard(50, -100, 100)).toBeNull();
  });

  it('regresión v4.4: la app usa "avg equity" como ROE principal', () => {
    // Verificamos que con datos canónicos las dos fórmulas son distinguibles.
    const ni = 100;
    const eqStart = 900;
    const eqEnd = 1100;
    const gf = roeStandard(ni, eqStart, eqEnd);
    const bf = roeBuffett(ni, eqEnd);
    expect(gf).not.toBe(bf);
    expect(Math.abs(gf - bf)).toBeGreaterThan(0.005); // ≥0.5pp diferencia
  });
});
