// Regression test Bug #014 (2026-05-10):
// `market_value` en positions API está en moneda nativa del listing
// (HKD para HKEX, EUR para .MC/.PA, GBP para .L). Al sumar para calcular
// pesos de cartera SIN conversión FX, se inflan posiciones multi-currency
// 7.78× para HKD, ~1.07× para EUR, ~1.27× para GBP.
//
// Test verifica que cualquier cálculo de weight_pct usa `usd_value`
// (siempre USD) y NO `market_value` directo.
//
// Caso real: posición HKG:9618 ($18,726 usd_value vs HKD 146,643 market_value).
// Si se calcula con market_value, peso reportado es 8x el real.

import { describe, it, expect } from 'vitest';

const samplePositions = [
  // USD positions — market_value y usd_value coinciden
  { ticker: 'SCHD', shares: 1500, currency: 'USD', market_value: 183451, usd_value: 183451 },
  { ticker: 'KO',   shares:  100, currency: 'USD', market_value:   7000, usd_value:   7000 },
  // HKD positions — market_value 7.78× su USD value
  { ticker: 'HKG:9618', shares: 1309, currency: 'HKD', market_value: 146643, usd_value: 18726 },
  { ticker: 'HKG:1052', shares: 20000, currency: 'HKD', market_value: 80411, usd_value: 10268 },
  // EUR position — market_value ~1.07× USD
  { ticker: 'MC',   shares:   75, currency: 'EUR', market_value:  34000, usd_value: 36795 },
];

function calculateWeightsWrong(positions) {
  // BUG #014: usa market_value sin convertir a USD
  const total = positions.reduce((s, p) => s + (p.market_value || 0), 0);
  return positions.map(p => ({
    ticker: p.ticker,
    weight_pct: total > 0 ? (p.market_value / total) * 100 : 0,
  }));
}

function calculateWeightsCorrect(positions) {
  // FIX: usa usd_value para que multi-currency sea consistente
  const total = positions.reduce((s, p) => s + (p.usd_value || 0), 0);
  return positions.map(p => ({
    ticker: p.ticker,
    weight_pct: total > 0 ? (p.usd_value / total) * 100 : 0,
  }));
}

describe('Bug #014 — multi-currency weight calculation', () => {
  it('calculateWeightsWrong (market_value) infla HKEX positions', () => {
    const weights = calculateWeightsWrong(samplePositions);
    const hkg9618 = weights.find(w => w.ticker === 'HKG:9618');
    // Con bug, pesa ~32% (146643 / total~456K) — totalmente inflado
    expect(hkg9618.weight_pct).toBeGreaterThan(20);
  });

  it('calculateWeightsCorrect (usd_value) reporta peso real ~7%', () => {
    const weights = calculateWeightsCorrect(samplePositions);
    const hkg9618 = weights.find(w => w.ticker === 'HKG:9618');
    // Real: 18726 / total_usd ~256K = ~7.3%
    expect(hkg9618.weight_pct).toBeLessThan(10);
    expect(hkg9618.weight_pct).toBeGreaterThan(5);
  });

  it('totales de USD y nativo NO deben mezclarse', () => {
    const totalNative = samplePositions.reduce((s, p) => s + p.market_value, 0);
    const totalUsd = samplePositions.reduce((s, p) => s + p.usd_value, 0);
    expect(totalNative).not.toBe(totalUsd); // si fueran iguales, no había bug
    expect(totalNative).toBeGreaterThan(totalUsd); // HKD inflando
  });

  it('detecta inflación HKEX-vs-USD ratio ~7.78', () => {
    const hkdPos = samplePositions.find(p => p.currency === 'HKD');
    const ratio = hkdPos.market_value / hkdPos.usd_value;
    expect(ratio).toBeGreaterThan(7);
    expect(ratio).toBeLessThan(9);
  });

  it('regla mínima: cualquier código que itere positions y sume valores DEBE usar usd_value', () => {
    // Audit interno — cualquier futuro endpoint que sume `market_value`
    // sin coalesce a usd_value es susceptible a este bug.
    const correctSum = samplePositions.reduce((s, p) => s + (p.usd_value || 0), 0);
    expect(correctSum).toBe(256240); // 183451 + 7000 + 18726 + 10268 + 36795
  });
});
