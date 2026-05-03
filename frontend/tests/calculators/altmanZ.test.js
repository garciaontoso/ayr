// tests/calculators/altmanZ.test.js
//
// Tests de regresión sobre Altman Z-Score, importando la función real.
//
// Bug pattern #006: REIT no aplica Altman (sus ratios son intrínsecamente
// distintos: poco working capital, mucho debt sobre assets, etc.). FAST
// Tab muestra banner de warning. La función `calcAltmanZ` actual NO hace
// guard explícito por sector — sólo computa el score y lo devuelve. Este
// test documenta el gap: si añadimos un guard `if (sector === 'Real
// Estate') return { notApplicable: true }`, este test cambia.
//
// Por ahora, defendemos:
//   1. Healthy → Safe Zone (Z > 2.99)
//   2. Stressed → Grey Zone (1.81 < Z < 2.99)
//   3. Distress → Distress Zone (Z < 1.81)
//   4. REIT detection: el test importa isReit para confirmar que la app
//      tiene el helper para decidir saltarse Altman.

import { describe, it, expect } from 'vitest';
import { calcAltmanZ } from '../../src/calculators/altmanZ.js';
import { isReit } from '../../src/validators/index.js';

describe('calcAltmanZ — clasificación por zonas', () => {
  it('empresa sana (Apple-like) → Z > 3.0 (Safe Zone)', () => {
    // Apple-like: alta caja, buenos márgenes, gran market cap, deuda
    // moderada, retained earnings enormes.
    const data = {
      equity: 80_000_000_000,         // 80B
      totalDebt: 100_000_000_000,     // 100B
      cash: 60_000_000_000,           // 60B
      retainedEarnings: 50_000_000_000,
      operatingIncome: 110_000_000_000, // 110B EBIT
      revenue: 380_000_000_000,        // 380B
    };
    const mktCap = 3_000_000_000_000; // 3T market cap
    const r = calcAltmanZ(data, mktCap);
    expect(r.score).toBeGreaterThan(2.99);
    expect(r.zone).toBe('Segura');
    expect(r.zoneColor).toBe('var(--green)');
  });

  it('empresa estresada → Grey Zone (1.81 < Z < 2.99)', () => {
    const data = {
      equity: 600, totalDebt: 400, cash: 150,
      retainedEarnings: 100, operatingIncome: 100,
      revenue: 700,
    };
    const r = calcAltmanZ(data, 800);
    expect(r.score).toBeGreaterThan(1.81);
    expect(r.score).toBeLessThan(2.99);
    expect(r.zone).toBe('Gris');
    expect(r.zoneColor).toBe('var(--yellow)');
  });

  it('empresa en distress → Distress Zone (Z < 1.81)', () => {
    const data = {
      equity: 100, totalDebt: 900, cash: 50,
      retainedEarnings: -200, operatingIncome: 10,
      revenue: 300,
    };
    const r = calcAltmanZ(data, 50);
    expect(r.score).toBeLessThan(1.81);
    expect(r.zone).toBe('Peligro');
    expect(r.zoneColor).toBe('var(--red)');
  });

  it('null/empty data → score:null, zone:"—" (no crash)', () => {
    expect(calcAltmanZ(null, 1000).score).toBeNull();
    expect(calcAltmanZ(null, 1000).zone).toBe('—');
    expect(calcAltmanZ({}, 1000).score).toBeNull();
    expect(calcAltmanZ({ revenue: 0 }, 1000).score).toBeNull();
  });

  it('totalAssets=0 → score:null (división segura)', () => {
    // equity=0 y totalDebt=0 → assets=0 → función devuelve null
    const r = calcAltmanZ({
      equity: 0, totalDebt: 0, cash: 100,
      retainedEarnings: 100, operatingIncome: 50, revenue: 200,
    }, 500);
    expect(r.score).toBeNull();
  });

  it('items[] tiene 5 componentes A-E con weighted suma = score', () => {
    const data = {
      equity: 500, totalDebt: 500, cash: 200,
      retainedEarnings: 300, operatingIncome: 100, revenue: 800,
    };
    const r = calcAltmanZ(data, 2000);
    expect(r.items).toHaveLength(5);
    const sumW = r.items.reduce((acc, i) => acc + i.weighted, 0);
    expect(sumW).toBeCloseTo(r.score, 6);
  });
});

describe('Altman Z-Score: REIT detection (Bug Pattern #006)', () => {
  it('isReit detecta sector Real Estate', () => {
    expect(isReit({ sector: 'Real Estate', industry: 'REIT - Diversified' })).toBe(true);
  });

  it('isReit detecta industry mortgage REITs', () => {
    expect(isReit({ sector: 'Financial Services', industry: 'Mortgage REITs' })).toBe(true);
  });

  it('isReit false para Technology', () => {
    expect(isReit({ sector: 'Technology', industry: 'Software' })).toBe(false);
  });

  it('isReit false para profile null/undefined', () => {
    expect(isReit(null)).toBe(false);
    expect(isReit(undefined)).toBe(false);
    expect(isReit({})).toBe(false);
  });

  // Documenta gap: la función actual no se salta el cálculo para REITs.
  // Si en el futuro añadimos guard, este test cambia/se elimina y se
  // asierta `notApplicable: true` en su lugar.
  it('TODO: calcAltmanZ debería devolver notApplicable=true para REITs', () => {
    const reitProfile = { sector: 'Real Estate', industry: 'REIT - Diversified' };
    const reitData = {
      equity: 5_000_000_000, totalDebt: 8_000_000_000, cash: 200_000_000,
      retainedEarnings: -500_000_000, operatingIncome: 400_000_000,
      revenue: 1_200_000_000,
    };
    const r = calcAltmanZ(reitData, 10_000_000_000);
    // Estado actual: la función calcula el score sin saber que es REIT.
    // Quien llama (FastTab) usa isReit() para decidir si mostrarlo.
    expect(r.score).not.toBeNull();
    // El llamador puede combinar:
    expect(isReit(reitProfile)).toBe(true);
    // → frontend hide del card si isReit && altman.score (banner warning).
  });
});
