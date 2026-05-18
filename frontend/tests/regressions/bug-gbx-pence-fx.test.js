// Regression test — GBX (pence) currency requires /100 division before FX.
//
// LSE quotes many UK stocks in pence (GBX), not pounds (GBP).
// 100 pence = 1 GBP. Si no aplicamos la división, una posición en ULVR.L
// a 4000 GBX (= £40) se convierte a $5,063 USD en lugar de $50.63.
//
// Test garantiza que toUsd() y convertCcy() manejan GBX correctamente.

import { describe, it, expect } from 'vitest';
import { toUsd } from '../../src/calculators/portfolioMetrics';
import { convertCcy } from '../../src/utils/currency';

const FX = { USD: 1, EUR: 0.92, GBP: 0.79, GBX: 0.79 };  // GBX a veces aparece en FX igual que GBP

describe('Bug GBX-fx — pence to USD conversion', () => {
  it('GBX is divided by 100 before applying GBP rate', () => {
    // 79,000 pence = 790 GBP = $1,000 USD
    expect(toUsd(79000, 'GBX', FX)).toBeCloseTo(1000, 0);
  });

  it('regression: WITHOUT /100 would give 100x inflated value', () => {
    // Si alguien re-introdujera el bug, 79,000 GBX se trataría como £79,000
    // = $100,000 USD. Eso es 100× lo correcto.
    const value = toUsd(79000, 'GBX', FX);
    expect(value).toBeLessThan(2000);  // no debe ser ~100,000
    expect(value).toBeGreaterThan(900);
  });

  it('convertCcy GBX → USD handles /100', () => {
    // 39,500 pence = £395 = $500 USD
    expect(convertCcy(39500, 'GBX', 'USD', FX)).toBeCloseTo(500, 0);
  });

  it('convertCcy GBX → EUR with chained conversion', () => {
    // 39,500 GBX → 500 USD → 460 EUR
    expect(convertCcy(39500, 'GBX', 'EUR', FX)).toBeCloseTo(460, 0);
  });

  it('GBP passes through unchanged', () => {
    // GBP no necesita /100
    expect(toUsd(790, 'GBP', FX)).toBeCloseTo(1000, 0);
  });
});

describe('Bug GBX-fx — real holdings cases', () => {
  it('ULVR.L position calculated correctly', () => {
    // ULVR.L: 100 shares @ 4,000 pence avg → £4,000 invested → ~$5,063 USD
    const sharesValue = 100 * 4000;  // 400,000 pence
    const usdValue = toUsd(sharesValue, 'GBX', FX);
    expect(usdValue).toBeCloseTo(5063, 0);
  });

  it('RKT.L position calculated correctly', () => {
    // RKT.L: 50 shares @ 5,500 pence → £2,750 → ~$3,481 USD
    const sharesValue = 50 * 5500;  // 275,000 pence
    const usdValue = toUsd(sharesValue, 'GBX', FX);
    expect(usdValue).toBeCloseTo(3481, 0);
  });
});
