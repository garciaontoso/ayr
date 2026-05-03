// tests/calculators/affoCheck.test.js
//
// REIT detection (isReit) + AFFO yield helper.
//
// Bug Pattern #006 (docs/bug-patterns.md): valorar REIT con EPS
// produce Normal P/E 50x+ y MoS negativos absurdos. La app detecta REIT
// vía sector/industry y conmuta a `fgMode='fcfe'` (= AFFO proxy).
//
// Aquí testeamos:
//   1. isReit: matriz de casos canónicos.
//   2. computeAffoYield: helper inline de tests para asegurar que un
//      REIT con FFO=$1B, shares=100M, price=$50 da AFFO yield ≈ 20%.
//      (Este helper no existe aún en el código; documenta el contrato
//      esperado por DashTab cuando se implemente.)

import { describe, it, expect } from 'vitest';
import { isReit } from '../../src/validators/index';

describe('isReit — REIT detection', () => {
  it('sector="Real Estate" → true', () => {
    expect(isReit({ sector: 'Real Estate' })).toBe(true);
  });

  it('sector="Real Estate" + industry "REIT - Diversified" → true', () => {
    expect(isReit({ sector: 'Real Estate', industry: 'REIT - Diversified' })).toBe(true);
  });

  it('industry contiene "REIT" pero sector ≠ Real Estate → true', () => {
    // Caso edge: FMP a veces clasifica mortgage REITs en Financial Services.
    expect(isReit({ sector: 'Financial Services', industry: 'Mortgage REITs' })).toBe(true);
  });

  it('industry "Reit" en minúsculas → true (case-insensitive)', () => {
    expect(isReit({ sector: 'Other', industry: 'reit - residential' })).toBe(true);
  });

  it('Technology → false', () => {
    expect(isReit({ sector: 'Technology', industry: 'Software' })).toBe(false);
  });

  it('Financial Services Bank → false (no es REIT)', () => {
    expect(isReit({ sector: 'Financial Services', industry: 'Banks—Diversified' })).toBe(false);
  });

  it('profile null → false (no crash)', () => {
    expect(isReit(null)).toBe(false);
  });

  it('profile undefined → false', () => {
    expect(isReit(undefined)).toBe(false);
  });

  it('profile sin sector/industry → false', () => {
    expect(isReit({})).toBe(false);
    expect(isReit({ sector: '' })).toBe(false);
  });

  it('industry "Industrial REIT" → true (REIT en cualquier posición)', () => {
    expect(isReit({ sector: 'Real Estate', industry: 'Industrial REIT' })).toBe(true);
  });
});

describe('AFFO yield helper (referencia de contrato)', () => {
  // Helper inline. Si en el futuro se extrae a calculators/affo.js,
  // estos tests cambian el import y listo.
  function computeAffoYield({ ffo, shares, price }) {
    if (!Number.isFinite(ffo) || ffo <= 0) return null;
    if (!Number.isFinite(shares) || shares <= 0) return null;
    if (!Number.isFinite(price) || price <= 0) return null;
    const ffoPerShare = ffo / shares;
    return ffoPerShare / price;
  }

  it('REIT con FFO $1B, shares 100M, price $50 → AFFO yield = 20%', () => {
    const yld = computeAffoYield({
      ffo: 1_000_000_000,
      shares: 100_000_000,
      price: 50,
    });
    expect(yld).toBeCloseTo(0.20, 4); // $10/$50 = 0.20
  });

  it('REIT con FFO $500M, shares 100M, price $25 → AFFO yield = 20%', () => {
    const yld = computeAffoYield({
      ffo: 500_000_000,
      shares: 100_000_000,
      price: 25,
    });
    expect(yld).toBeCloseTo(0.20, 4); // $5/$25 = 0.20
  });

  it('FFO 0 → null (no aplicable)', () => {
    expect(computeAffoYield({ ffo: 0, shares: 100e6, price: 50 })).toBeNull();
  });

  it('shares=0 → null (no division by zero)', () => {
    expect(computeAffoYield({ ffo: 1e9, shares: 0, price: 50 })).toBeNull();
  });

  it('price=0 → null', () => {
    expect(computeAffoYield({ ffo: 1e9, shares: 100e6, price: 0 })).toBeNull();
  });

  it('inputs no finitos → null', () => {
    expect(computeAffoYield({ ffo: NaN, shares: 100e6, price: 50 })).toBeNull();
    expect(computeAffoYield({ ffo: 1e9, shares: Infinity, price: 50 })).toBeNull();
  });
});
