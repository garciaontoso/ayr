// Regression test — ROE / P/B con equity negativo deben devolver null.
//
// Empresas con buybacks agresivos (MCD, BA, HD, IBM, MO) tienen equity NEGATIVO
// porque el book value de buybacks supera retained earnings.
//
// Bug original: dividir netIncome / equity con equity negativo daba ROE absurdos
// como -230% o ±999% que crasheaban la UI o mostraban valores que no significaban
// nada.
//
// Fix: calcRoeSafe() devuelve null cuando equity <= 0. La UI muestra "—" en
// lugar de un número absurdo.

import { describe, it, expect } from 'vitest';
import { calcRoeSafe, calcPbSafe, calcRoicSafe } from '../../src/calculators/companyMetrics';

describe('Bug ROE-NegEquity — null instead of absurd values', () => {
  it('regression: MCD case (equity -3.7B, NI 8.5B)', () => {
    // Crude calc: -230% — el peor número del mundo, pero MCD es una de las
    // empresas más rentables. ROE es la métrica equivocada para ellos.
    expect(calcRoeSafe(8500, -3700)).toBeNull();
  });

  it('regression: BA case (equity negativo)', () => {
    expect(calcRoeSafe(2000, -1500)).toBeNull();
  });

  it('regression: HD pattern', () => {
    // HD equity también es negativo intermitentemente
    expect(calcRoeSafe(15000, -5000)).toBeNull();
  });

  it('zero equity returns null (no Infinity)', () => {
    expect(calcRoeSafe(100, 0)).toBeNull();
  });

  it('normal positive equity returns valid ROE', () => {
    expect(calcRoeSafe(150, 1000)).toBeCloseTo(0.15);
  });
});

describe('Bug P/B-NegEquity', () => {
  it('regression: P/B is null when equity negative', () => {
    // BA: price $200, shares 600M, equity -1.5B → BVPS = -2.5 → P/B = -80 (sin sentido)
    expect(calcPbSafe(200, 600, -1500)).toBeNull();
  });

  it('zero shares returns null (no divide-by-zero)', () => {
    expect(calcPbSafe(100, 0, 1000)).toBeNull();
  });

  it('normal case works', () => {
    // KO: price $70, shares 4.3B, equity 24B → BVPS 5.58 → P/B 12.5
    expect(calcPbSafe(70, 4300, 24000)).toBeCloseTo(70 / (24000 / 4300), 2);
  });
});

describe('Bug ROIC-NegEquity — also protected', () => {
  it('regression: returns null when avg invested capital ≤ 0', () => {
    const curr = { operatingIncome: 100, equity: -500, totalDebt: 100, cash: 0 };
    expect(calcRoicSafe(curr, null, 25)).toBeNull();
  });

  it('returns null for negative operating income', () => {
    const curr = { operatingIncome: -10, equity: 500, totalDebt: 100, cash: 50 };
    expect(calcRoicSafe(curr, null, 25)).toBeNull();
  });

  it('normal case computes correctly with avg', () => {
    const curr = { operatingIncome: 200, equity: 500, totalDebt: 300, cash: 50 };
    const prev = { operatingIncome: 180, equity: 480, totalDebt: 310, cash: 40 };
    const r = calcRoicSafe(curr, prev, 25);
    expect(r).toBeCloseTo(0.20, 2);
  });
});

describe('Bug ROE-NegEquity — UI fallback consistency', () => {
  it('all three metrics (ROE/PB/ROIC) return null for neg-equity company', () => {
    // Garantiza UX consistente: si ROE es null, P/B y ROIC también lo son
    const curr = { netIncome: 1000, equity: -500, totalDebt: 200, cash: 100, operatingIncome: 800 };
    expect(calcRoeSafe(curr.netIncome, curr.equity)).toBeNull();
    expect(calcPbSafe(50, 100, curr.equity)).toBeNull();
    expect(calcRoicSafe(curr, null, 25)).toBeNull();
  });
});
